// Which NEXRAD radars are offline — the red chips in RadarScope's site
// picker.
//
// Source: api.weather.gov/radar/stations, one ~410 KB GeoJSON listing every
// WSR-88D with two live blocks per station:
//
//   latency.levelTwoLastReceivedTime  when the last Level II chunk arrived
//   rda.properties.{status, operabilityStatus, alarmSummary}
//
// What was measured on 2026-10-05 (159 stations), and why the rule below is
// built on data age rather than on the status words:
//
//   - The four radars RadarScope drew red that morning (EOX, EVX, MOB, VAX)
//     had sent no Level II for 56 h to 6 days. Working radars were 0.5–0.7
//     min old. Nothing in between: the gap is days against seconds.
//   - Three of those four reported `Operate` / `RDA - On-line` / "No
//     Alarms" — a radar whose link is down keeps its last-known status.
//     Status alone would have shown them as healthy.
//   - 41 radars reported "Maintenance Action Mandatory", LWX and DIX among
//     them, while streaming normally. That phrase is a maintenance flag,
//     not an outage; treating it as offline would have painted a quarter
//     of the network red.
//   - Two radars read `Start-Up` / `RDA - Inoperable` (VAX, LRX); both were
//     also hours stale. Inoperable is kept as a second, independent signal
//     so a radar that is down but still trickling status is caught too.
//
// Level II and the Level III products this app draws travel separate paths
// after the radar, so a radar could in principle be fresh here and late in
// the Level III bucket. The frame-age chip already reports that case for
// the radar on screen; this module answers the picker's question, "is that
// radar transmitting at all?".

const axios = require("axios");
const { recordServiceCall } = require("./serviceStatus");
const { increment } = require("./requestCounter");

const SERVICE_NAME = "NWS (radar status)";
const STATIONS_URL = "https://api.weather.gov/radar/stations?stationType=WSR-88D";
const NWS_USER_AGENT = "sweep-radar (radar status; github.com/Aryeh95/sweep)";
const TIMEOUT_MS = 15000;
// Status changes on the scale of hours; the picker polls every 5 min.
const CACHE_TTL_MS = 5 * 60 * 1000;
// Level II streams in chunks as the antenna turns, so even the slowest
// clear-air volume (≈ 10 min) delivers data every few seconds. Fifteen
// minutes without any is an outage, not a slow scan.
const OFFLINE_AFTER_MIN = 15;
const INOPERABLE = /inoperable/i;
const DOWN_STATUSES = new Set(["Start-Up", "Standby", "Offline"]);

let cache = null; // { value, expires }
let inflight = null;

/**
 * Classify one station from its NWS properties.
 *
 * `offline` when no Level II has arrived for OFFLINE_AFTER_MIN, or the RDA
 * reports itself inoperable / not operating. `unknown` when the feed has no
 * latency block for it (an overseas DoD site, or a gap in the feed) — the
 * picker draws those as normal chips rather than guessing.
 *
 * @param {Object} props station `properties` from /radar/stations
 * @param {Number} nowMs current time, epoch ms
 * @returns {{state: "online"|"offline"|"unknown", reason: String|null, lastDataTime: String|null, ageMin: Number|null, status: String|null, operability: String|null}}
 */
function classifyStation(props, nowMs) {
  const latency = (props && props.latency) || {};
  const rda = ((props && props.rda) || {}).properties || {};
  const lastDataTime = latency.levelTwoLastReceivedTime || null;
  const lastMs = Date.parse(lastDataTime || "");
  const ageMin = Number.isFinite(lastMs) ? Math.max(0, Math.round((nowMs - lastMs) / 60000)) : null;
  const status = rda.status || null;
  const operability = rda.operabilityStatus || null;
  let state = "online";
  let reason = null;
  if (ageMin === null) {
    state = "unknown";
  } else if (ageMin > OFFLINE_AFTER_MIN) {
    state = "offline";
    reason = "no-data";
  }
  if ((operability && INOPERABLE.test(operability)) || (status && DOWN_STATUSES.has(status))) {
    state = "offline";
    reason = reason || "inoperable";
  }
  return { state, reason, lastDataTime, ageMin, status, operability };
}

/**
 * Reduce the NWS station collection to the picker's map, keyed by the
 * 3-letter id the rest of the app uses (KLWX → LWX).
 *
 * @param {Object} geojson /radar/stations response
 * @param {Number} nowMs current time, epoch ms
 * @returns {Object<String, Object>} id → classifyStation result
 */
function summarizeStations(geojson, nowMs) {
  const out = {};
  const features = (geojson && Array.isArray(geojson.features)) ? geojson.features : [];
  for (const f of features) {
    const p = f && f.properties;
    if (!p || p.stationType !== "WSR-88D" || typeof p.id !== "string" || p.id.length !== 4) continue;
    out[p.id.slice(1)] = classifyStation(p, nowMs);
  }
  return out;
}

/**
 * Fetch and summarise, cached and single-flight. On failure the last good
 * map is returned marked `stale` (a picker that silently keeps old reds or
 * greens is worse than one that says it is old).
 *
 * @returns {Promise<Object>} `{available, fetchedAt, offlineAfterMin, stale, sites}`
 */
async function fetchRadarStatus() {
  if (cache && cache.expires > Date.now()) return cache.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await axios.get(STATIONS_URL, {
        timeout: TIMEOUT_MS,
        headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
      });
      increment("nws", "radar-status");
      const nowMs = Date.now();
      const sites = summarizeStations(res.data, nowMs);
      const offline = Object.values(sites).filter((s) => s.state === "offline").length;
      const value = {
        available: true,
        fetchedAt: new Date(nowMs).toISOString(),
        offlineAfterMin: OFFLINE_AFTER_MIN,
        stale: false,
        sites,
      };
      cache = { value, expires: nowMs + CACHE_TTL_MS };
      recordServiceCall(SERVICE_NAME, 200, `${Object.keys(sites).length} radars, ${offline} offline`);
      return value;
    } catch (err) {
      recordServiceCall(SERVICE_NAME, err?.response?.status || 500, `radar status unavailable: ${err.message}`);
      if (cache) {
        // Keep serving the last answer, flagged, and retry sooner.
        cache = { value: { ...cache.value, stale: true }, expires: Date.now() + 60 * 1000 };
        return cache.value;
      }
      return { available: false, reason: "upstream-unavailable", sites: {} };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * GET /api/radar/status — operating state of every WSR-88D, for the site
 * picker. Never fails the request: an upstream outage answers
 * `available: false` (or the last good map with `stale: true`).
 *
 * @param {Object} req
 * @param {Object} res
 */
async function getRadarStatus(req, res) {
  const value = await fetchRadarStatus();
  return res.status(200).json(value).end();
}

module.exports = {
  getRadarStatus,
  fetchRadarStatus,
  classifyStation,
  summarizeStations,
  OFFLINE_AFTER_MIN,
  SERVICE_NAME,
};
