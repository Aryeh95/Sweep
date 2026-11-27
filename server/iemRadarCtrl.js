// IEM (Iowa Environmental Mesonet) NEXRAD radar support.
//
// This controller backs the two-layer radar design:
//
//   Layer 1 — composite mosaic (low zoom). Pure client-side URL
//     construction: IEM regenerates `nexrad-n0q-900913` on a fixed
//     5-minute schedule, and the animation frames are addressed by
//     fixed offsets (`-m05m`, `-m10m`, … `-m50m`). No frame discovery
//     is needed, so no server route exists for it.
//
//   Layer 2 — single-site super-res base reflectivity (high zoom).
//     `ridge::XXX-N0B-<timestamp>` tiles. These are NOT on a
//     predictable grid: a NEXRAD volume scan completes every 4-6 min
//     depending on the VCP the radar is running, and the VCP changes
//     with the weather. The timestamps therefore cannot be computed
//     client-side and must be discovered. That discovery is the
//     reason this file exists.
//
// Frame discovery uses IEM's JSON radar API rather than scraping the
// browsable RIDGE image folders. Verified live 2026-08-11:
//
//   /json/radar.py?operation=available&lat=&lon=   → radars near a point
//   /json/radar.py?operation=products&radar=DIX    → products for a site
//   /json/radar.py?operation=list&radar=&product=&start=&end=
//       → {"scans":[{"ts":"2026-08-11T21:51Z"}, …]}
//
// The `list` operation is the one that matters: it returns the exact
// scan times, which map 1:1 onto the `-<timestamp>` tile segment.
//
// Tiles themselves are NOT proxied. They are keyless, public, and
// served straight to Leaflet's <img> tags — the same arrangement the
// RainViewer and ECCC layers already used. Only the JSON is proxied,
// which keeps CORS out of the picture and gives us one place to cache.

const axios = require("axios");
const { recordServiceCall } = require("./serviceStatus");
const { getSettingsData } = require("./settingsCtrl");
const { increment } = require("./requestCounter");
const { BoundedMap } = require("./boundedCache");
const { fetchRadarStatus, OFFLINE_AFTER_MIN } = require("./radarStatusCtrl");
const NEXRAD_SITES = require("../client/src/components/WeatherMap/nexradSites.json");

const SERVICE_NAME = "IEM (radar)";
const API_TIMEOUT_MS = 10_000;

const FAILOVER_MAX_KM = 250;
const STALE_AFTER_MS = OFFLINE_AFTER_MIN * 60 * 1000;
const EARTH_R_KM = 6371;

const IEM_JSON_BASE = "https://mesonet.agron.iastate.edu/json/radar.py";
const NWS_POINTS_BASE = "https://api.weather.gov/points";

// NWS asks for an identifying User-Agent on api.weather.gov. The existing
// govAlertSources/nws.js sends the same courtesy header.
const NWS_USER_AGENT = "sweep-radar (radar site lookup; github.com/Aryeh95/sweep)";

// Default product. N0B is super-res base reflectivity (0.5° tilt,
// 0.25 km gates) — native radial data, the same product RadarScope
// shows by default, and confirmed present in `operation=products`.
const DEFAULT_PRODUCT = "N0B";

// How far back to ask for scans. Sized to fill a 30-frame loop even in
// the slowest clear-air VCP (~10 min/volume → 300 min); in storm mode
// the same window returns more scans and the count cap below takes the
// most recent 30. Still a short JSON list either way (~30-75 entries).
const FRAME_LOOKBACK_MS = 300 * 60 * 1000;

// Most recent N scans returned to the client. 30 frames matches
// RadarScope's default loop length — ~2 to 2.5 h of history at a 4-6 min
// storm-mode cadence. (The mosaic layer still tops out at its 10 fixed
// 5-minute offsets; IEM publishes nothing older than -m50m.)
const DEFAULT_FRAME_COUNT = 30;
const MAX_FRAME_COUNT = 30;

// Frame lists are cached briefly. A new volume scan lands every 4-6 min,
// so 45 s keeps the displayed frame age honest (the whole point of the
// feature is that staleness is visible) without re-asking IEM on every
// client poll.
const FRAMES_TTL_MS = 45 * 1000;
const FRAMES_CACHE_MAX = 32;
const framesCache = new BoundedMap(FRAMES_CACHE_MAX);

// Composite mosaic metadata. IEM publishes a small JSON beside the N0Q
// composite it regenerates every 5 minutes; its `valid` field is the
// nominal product time of the CURRENT mosaic frame — the one the bare
// `nexrad-n0q-900913` layer serves. Verified live 2026-09-03:
//   {"meta": {"product": "N0Q", "site": "USCOMP", "valid": "2026-09-03T02:55:00Z",
//             "processing_time_secs": 100, "radar_quorum": "142/147"}}
// Without it the client could only ASSUME the mosaic sits on the 5-min
// boundary it was polled after; with it the mosaic's frame age is a
// real number like the single-site layer's. Cached one minute — the
// file changes every five.
const MOSAIC_META_URL = "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json";
const MOSAIC_META_TTL_MS = 60 * 1000;
let mosaicMetaCache = null;

// GOES-East imagery valid times, one sidecar per channel, next to the
// rasters IEM's `goes_east_conus_chNN` tile layers are cut from. The
// satellite name is baked into the filename — GOES-19 has been GOES-East
// since April 2025 (the GOES-16 files still exist but froze that day) —
// so when the East slot changes bird again, this is the one line to
// move. CONUS scans every 5 min; measured 2026-09-25: valid 18:56:16Z,
// generated 19:01:09Z, so the picture is ~5-8 min old when it lands.
const SATELLITE_META_URLS = {
  ir: "https://mesonet.agron.iastate.edu/data/gis/images/GOES/conus/channel13/GOES-19_C13.json",
  vis: "https://mesonet.agron.iastate.edu/data/gis/images/GOES/conus/channel02/GOES-19_C02.json",
};
const SATELLITE_META_TTL_MS = 60 * 1000;
let satelliteMetaCache = null;

// Site resolution is far more stable — the radar assigned to a point
// only changes when the user moves the map somewhere else entirely.
// Cache for a day, keyed on coarse coordinates.
const SITE_TTL_MS = 24 * 60 * 60 * 1000;
const SITE_CACHE_MAX = 64;
const siteCache = new BoundedMap(SITE_CACHE_MAX);
const activeFailovers = new BoundedMap(SITE_CACHE_MAX);

/**
 * Convert an IEM scan timestamp into the compact form the RIDGE tile
 * URL segment expects.
 *
 * IEM returns ISO-ish minute-precision UTC (`2026-08-11T21:51Z`); the
 * tile path wants `YYYYMMDDHHMM` (`202608112151`). Done by stripping
 * separators rather than by re-formatting a Date, so we can't
 * accidentally shift the value into local time.
 *
 * @param {String} ts IEM scan timestamp, e.g. "2026-08-11T21:51Z"
 * @returns {String|null} e.g. "202608112151", or null if unparseable
 */
function toTileStamp(ts) {
  if (typeof ts !== "string") return null;
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}`;
}

/**
 * Parse an IEM scan timestamp to epoch milliseconds.
 *
 * The `Z` suffix makes these unambiguous UTC, so Date.parse is safe
 * here (the codebase avoids it for bare local-time strings).
 *
 * @param {String} ts IEM scan timestamp
 * @returns {Number|null} epoch ms, or null if unparseable
 */
function toEpochMs(ts) {
  if (typeof ts !== "string") return null;
  const n = Date.parse(ts);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a Date as the `YYYY-MM-DDTHH:MMZ` string the IEM `list`
 * operation accepts for its start/end bounds.
 *
 * @param {Date} d
 * @returns {String}
 */
function toIemBound(d) {
  return `${d.toISOString().slice(0, 16)}Z`;
}

/**
 * Normalise an NWS radar station id to the 3-letter form IEM's RIDGE
 * layers use.
 *
 * `api.weather.gov/points/{lat},{lon}` reports a 4-character ICAO-style
 * id — `KDIX` in CONUS, `PAHG` in Alaska, `TJUA` in Puerto Rico — while
 * IEM addresses the same sites with 3 letters (`DIX`, `AHG`, `JUA`).
 * Dropping the leading region letter is the correct transform for all
 * of them. Ids that are already 3 characters pass through unchanged.
 *
 * @param {String} station e.g. "KDIX"
 * @returns {String|null} e.g. "DIX", or null if not a plausible id
 */
function normalizeSiteId(station) {
  if (typeof station !== "string") return null;
  const s = station.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(s)) return s;
  if (/^[A-Z]{4}$/.test(s)) return s.slice(1);
  return null;
}

const STATIC_SITES = NEXRAD_SITES
  .map((s) => {
    const site = normalizeSiteId(s && s.id);
    if (!site || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return null;
    return { site, name: s.name || null, lat: s.lat, lon: s.lon };
  })
  .filter(Boolean);
const STATIC_SITE_MAP = new Map(STATIC_SITES.map((s) => [s.site, s]));

/**
 * Great-circle distance in km between two {lat, lon} coordinates.
 *
 * @param {{lat: Number, lon: Number}} a
 * @param {{lat: Number, lon: Number}} b
 * @returns {Number} distance in km
 */
function distanceKm(a, b) {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return EARTH_R_KM * Math.acos(Math.max(-1, Math.min(1, x)));
}

/**
 * Whether an ordered (oldest-first) scan frame list is empty or its newest
 * scan is older than STALE_AFTER_MS (matching NWS offline latency threshold).
 *
 * @param {Array<Object>} frames
 * @param {Number} [nowMs]
 * @returns {Boolean}
 */
function framesAreStale(frames, nowMs = Date.now()) {
  if (!Array.isArray(frames) || frames.length === 0) return true;
  const newest = frames[frames.length - 1];
  const epoch = newest && newest.epoch;
  if (!Number.isFinite(epoch)) return true;
  return nowMs - epoch > STALE_AFTER_MS;
}

/**
 * Build a distance-ranked list of alternative NEXRAD sites within
 * FAILOVER_MAX_KM around `refPoint` (or the primary radar's coordinates).
 *
 * @param {String} primarySite 3-letter id
 * @param {{lat: Number, lon: Number}|null} refPoint
 * @param {Array<Object>} [extraCandidates]
 * @returns {Array<{site: String, name: String|null, lat: Number|null, lon: Number|null, distKm: Number}>}
 */
function rankFallbackCandidates(primarySite, refPoint, extraCandidates = []) {
  const origin = (refPoint && Number.isFinite(refPoint.lat) && Number.isFinite(refPoint.lon))
    ? refPoint
    : STATIC_SITE_MAP.get(primarySite);
  if (!origin) return [];

  const bySite = new Map();
  for (const c of extraCandidates || []) {
    const id = normalizeSiteId(c && (c.site || c.id));
    if (!id || id === primarySite) continue;
    const base = STATIC_SITE_MAP.get(id);
    const lat = Number.isFinite(c.lat) ? c.lat : base?.lat ?? null;
    const lon = Number.isFinite(c.lon) ? c.lon : base?.lon ?? null;
    const distKm = (Number.isFinite(lat) && Number.isFinite(lon))
      ? distanceKm(origin, { lat, lon })
      : (Number.isFinite(c.distKm) ? c.distKm : null);
    if (!Number.isFinite(distKm)) continue;
    bySite.set(id, {
      site: id,
      name: c.name || base?.name || null,
      lat,
      lon,
      distKm,
    });
  }
  for (const s of STATIC_SITES) {
    if (s.site === primarySite || bySite.has(s.site)) continue;
    bySite.set(s.site, {
      site: s.site,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      distKm: distanceKm(origin, s),
    });
  }

  return Array.from(bySite.values())
    .filter((c) => Number.isFinite(c.distKm) && c.distKm <= FAILOVER_MAX_KM)
    .sort((a, b) => a.distKm - b.distKm);
}

/**
 * Pick the nearest online candidate when NWS confirms `primarySite` is offline.
 * Fails open (returns null) when status is unavailable or primary is not
 * explicitly "offline".
 *
 * @param {String} primarySite 3-letter id
 * @param {Array<Object>} candidates distance-sorted candidates
 * @param {Object|null} statusPayload payload from radarStatusCtrl
 * @returns {Object|null} winning candidate or null
 */
function pickOnlineFallback(primarySite, candidates, statusPayload) {
  if (!primarySite || !statusPayload || !statusPayload.available || !statusPayload.sites) return null;
  if (statusPayload.sites[primarySite]?.state !== "offline") return null;
  for (const c of candidates || []) {
    if (!c || !c.site || c.site === primarySite) continue;
    if (Number.isFinite(c.distKm) && c.distKm > FAILOVER_MAX_KM) continue;
    if (statusPayload.sites[c.site]?.state === "online") return c;
  }
  return null;
}

/**
 * Whether `primarySite` is currently failed over to an alternate radar.
 *
 * @param {String} primarySite 3-letter id
 * @returns {Boolean}
 */
function isFailoverActive(primarySite) {
  return Boolean(primarySite && activeFailovers.has(primarySite));
}

/**
 * Consult NWS station status and return either the nearest online fallback
 * within FAILOVER_MAX_KM (recording active failover) or the primary site.
 *
 * @param {String} primarySite 3-letter id
 * @param {Object} [opts]
 * @param {Number|null} [opts.lat]
 * @param {Number|null} [opts.lon]
 * @param {Array<Object>} [opts.candidates]
 * @param {Function} [opts.statusLoader]
 * @param {Number} [opts.nowMs]
 * @returns {Promise<{site: String, name: String|null, fallbackFrom: String|null}>}
 */
async function resolveFailover(primarySite, { lat, lon, candidates = [], statusLoader = fetchRadarStatus, nowMs = Date.now() } = {}) {
  if (!primarySite) return { site: primarySite, name: null, fallbackFrom: null };
  let statusPayload = null;
  try {
    statusPayload = await statusLoader();
  } catch {
    statusPayload = null;
  }
  const refPoint = (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;
  const ranked = rankFallbackCandidates(primarySite, refPoint, candidates);
  const fallback = pickOnlineFallback(primarySite, ranked, statusPayload);
  if (fallback) {
    activeFailovers.set(primarySite, { site: fallback.site, since: nowMs });
    return { site: fallback.site, name: fallback.name || null, fallbackFrom: primarySite };
  }
  activeFailovers.delete(primarySite);
  return { site: primarySite, name: null, fallbackFrom: null };
}

/**
 * Clear all module caches and active failover state (for tests).
 */
function clearRadarCaches() {
  siteCache.clear();
  framesCache.clear();
  activeFailovers.clear();
  mosaicMetaCache = null;
  satelliteMetaCache = null;
}

/**
 * Coarse cache key for a coordinate. Two decimal places is ~1 km,
 * far finer than the scale at which the assigned radar changes, so
 * this collapses the constant small jitter of a panning map into a
 * single cache entry.
 *
 * @param {Number} lat
 * @param {Number} lon
 * @returns {String}
 */
function coordKey(lat, lon) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * Resolve the NEXRAD site for a coordinate: the NEAREST radar.
 *
 * Primary source is IEM's `operation=available` list, filtered to
 * NEXRAD (it also carries TDWR terminal radars and the national
 * composite, neither of which serve N0B) and ranked by great-circle
 * distance. Nearest wins — that is what a radar viewer wants, and what
 * RadarScope does.
 *
 * NWS `points/{lat},{lon}` carries a `radarStation` too, and this used
 * to be the primary source. It is NOT a nearest-radar answer: it is the
 * forecast office's grid assignment, whose boundaries run through
 * populated areas (probed 2026-09-14: Towson → KLWX, but Essex 10 km
 * east → KDOX, with KLWX and KDOX within 4 km of each other in range).
 * A kiosk whose seeded location wandered across that line flipped
 * radars for no visible reason. NWS is now the fallback only, for when
 * IEM's list is unreachable.
 *
 * @param {Number} lat
 * @param {Number} lon
 * @returns {Promise<{site: String, name: String|null, source: String}>}
 * @throws {Error} when neither source yields a usable site
 */
async function resolveRadarSite(lat, lon) {
  const key = coordKey(lat, lon);
  const hit = siteCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let resolved = null;

  // --- Primary: nearest NEXRAD from IEM's radar list ----------------
  try {
    const res = await axios.get(IEM_JSON_BASE, {
      params: { operation: "available", lat, lon },
      timeout: API_TIMEOUT_MS,
    });
    increment("iem", "radar-available");
    const radars = Array.isArray(res.data?.radars) ? res.data.radars : [];
    const nexrads = radars.filter(
      (r) => r && r.type === "NEXRAD" && typeof r.id === "string"
        && Number.isFinite(r.lat) && Number.isFinite(r.lon)
    );
    if (nexrads.length) {
      const origin = { lat, lon };
      const ranked = nexrads
        .map((r) => ({
          site: normalizeSiteId(r.id) || r.id,
          name: r.name || null,
          lat: r.lat,
          lon: r.lon,
          distKm: distanceKm(origin, r),
        }))
        .sort((a, b) => a.distKm - b.distKm);
      const nearest = ranked[0];
      resolved = {
        site: nearest.site,
        name: nearest.name || null,
        source: "iem",
        candidates: ranked,
      };
      recordServiceCall(SERVICE_NAME, 200, `site ${resolved.site} via IEM (nearest)`);
    } else {
      recordServiceCall(SERVICE_NAME, 200, "no NEXRAD site near coord");
    }
  } catch (err) {
    // Non-fatal — fall through to NWS. Recorded so the health panel
    // can still see that IEM was tried and failed.
    recordServiceCall(SERVICE_NAME, err?.response?.status || 500, "IEM radar list failed");
  }

  // --- Fallback: NWS point metadata ---------------------------------
  if (!resolved) {
    const res = await axios.get(`${NWS_POINTS_BASE}/${lat.toFixed(4)},${lon.toFixed(4)}`, {
      timeout: API_TIMEOUT_MS,
      headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" },
    });
    increment("nws", "points");
    const site = normalizeSiteId(res.data?.properties?.radarStation);
    if (!site) {
      recordServiceCall(SERVICE_NAME, 200, "no NEXRAD site near coord");
      throw new Error("No NEXRAD site available for this location");
    }
    resolved = { site, name: null, source: "nws", candidates: [] };
    recordServiceCall(SERVICE_NAME, 200, `site ${site} via NWS fallback`);
  }

  siteCache.set(key, { value: resolved, expires: Date.now() + SITE_TTL_MS });
  return resolved;
}

/**
 * The user's manual site override from settings.json (`radarSite`), or
 * null for automatic. Read fresh on each call — it is one small file
 * read behind a 60 s client poll, and reading it live means a settings
 * save takes effect on the very next frame fetch with no restart.
 *
 * @returns {Promise<String|null>} 3-letter site id or null
 */
async function overrideSite() {
  try {
    const settings = await getSettingsData();
    const site = normalizeSiteId(settings && settings.radarSite);
    return site || null;
  } catch {
    return null; // No settings file yet — automatic.
  }
}

/**
 * GET /api/radar/site?lat&lon
 *
 * Returns the 3-letter NEXRAD site id the single-site super-res layer
 * should address, so the client never hardcodes one.
 *
 * @param {Object} req
 * @param {Object} res
 */
async function getRadarSite(req, res) {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json("Invalid coordinates").end();
  }

  const forced = await overrideSite();
  if (forced) {
    if (activeFailovers.has(forced)) {
      const fo = await resolveFailover(forced, { lat, lon });
      return res.status(200).json({
        available: true,
        site: fo.site,
        name: fo.name ?? null,
        source: "override",
        fallbackFrom: fo.fallbackFrom,
      }).end();
    }
    return res.status(200).json({ available: true, site: forced, name: null, source: "override", fallbackFrom: null }).end();
  }

  try {
    const resolved = await resolveRadarSite(lat, lon);
    if (activeFailovers.has(resolved.site)) {
      const fo = await resolveFailover(resolved.site, { lat, lon, candidates: resolved.candidates || [] });
      return res.status(200).json({
        available: true,
        site: fo.site,
        name: fo.name ?? resolved.name,
        source: resolved.source,
        fallbackFrom: fo.fallbackFrom,
      }).end();
    }
    return res.status(200).json({
      available: true,
      site: resolved.site,
      name: resolved.name,
      source: resolved.source,
      fallbackFrom: null,
    }).end();
  } catch (err) {
    // A location with no NEXRAD coverage (outside the US) is a normal
    // answer, not a server fault: the client hides the single-site
    // layer and stays on the mosaic. 200 + available:false mirrors how
    // pollenCtrl reports "no data at this coordinate".
    recordServiceCall(SERVICE_NAME, 200, "site unavailable");
    return res.status(200).json({ available: false, reason: String(err.message).slice(0, 120) }).end();
  }
}

/**
 * Normalise IEM's mosaic metadata JSON into the shape the client uses.
 *
 * @param {Object} data parsed n0q_0.json body
 * @returns {{valid: String, epoch: Number, radarQuorum: String|null}|null} null when the body carries no usable time
 */
function parseMosaicMeta(data) {
  const meta = data && data.meta;
  const valid = meta && typeof meta.valid === "string" ? meta.valid : null;
  const epoch = valid ? Date.parse(valid) : NaN;
  if (!Number.isFinite(epoch)) return null;
  return {
    valid,
    epoch,
    radarQuorum: typeof meta.radar_quorum === "string" ? meta.radar_quorum : null,
  };
}

/**
 * Valid time from one GOES channel sidecar (`{"meta": {"valid": ISO}}`).
 *
 * @param {Object} data parsed GOES-19_CNN.json body
 * @returns {{valid: String, epoch: Number}|null} null when the file carries no usable time
 */
function parseSatelliteMeta(data) {
  const meta = data && data.meta;
  const valid = meta && typeof meta.valid === "string" ? meta.valid : null;
  const epoch = valid ? Date.parse(valid) : NaN;
  if (!Number.isFinite(epoch)) return null;
  return { valid, epoch };
}

/**
 * Current GOES-East valid time per channel, cached. Never throws and
 * never blocks the frame list: a channel whose sidecar is unreachable
 * reports null and the client's satellite age row simply stays hidden.
 *
 * @returns {Promise<{ir: Object|null, vis: Object|null}>}
 */
async function fetchSatelliteMeta() {
  if (satelliteMetaCache && satelliteMetaCache.expires > Date.now()) return satelliteMetaCache.value;
  const one = async (url) => {
    try {
      const res = await axios.get(url, { timeout: API_TIMEOUT_MS });
      increment("iem", "satellite-meta");
      return parseSatelliteMeta(res.data);
    } catch {
      return null;
    }
  };
  const [ir, vis] = await Promise.all([one(SATELLITE_META_URLS.ir), one(SATELLITE_META_URLS.vis)]);
  const value = { ir, vis };
  satelliteMetaCache = { value, expires: Date.now() + SATELLITE_META_TTL_MS };
  return value;
}

/**
 * Current mosaic frame time, cached. Never throws: the mosaic layer
 * works without it (the client falls back to schedule-derived times),
 * so a metadata hiccup must not fail the whole frame list.
 *
 * @returns {Promise<Object|null>} parsed metadata, or null
 */
async function fetchMosaicMeta() {
  if (mosaicMetaCache && mosaicMetaCache.expires > Date.now()) return mosaicMetaCache.value;
  let value = null;
  try {
    const res = await axios.get(MOSAIC_META_URL, { timeout: API_TIMEOUT_MS });
    increment("iem", "mosaic-meta");
    value = parseMosaicMeta(res.data);
  } catch {
    value = null;
  }
  mosaicMetaCache = { value, expires: Date.now() + MOSAIC_META_TTL_MS };
  return value;
}

/**
 * Fetch and normalise the recent scan list for one site+product.
 *
 * Returned frames are oldest-first (IEM's own order), each carrying the
 * tile-ready stamp plus the parsed epoch so the client can render frame
 * age without re-parsing.
 *
 * @param {String} site 3-letter site id
 * @param {String} product IEM product id (e.g. "N0B")
 * @param {Number} count max frames to return (most recent N)
 * @returns {Promise<{site: String, product: String, frames: Array}>}
 */
async function fetchFrames(site, product, count) {
  const key = `${site}:${product}:${count}`;
  const hit = framesCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const now = Date.now();
  const res = await axios.get(IEM_JSON_BASE, {
    params: {
      operation: "list",
      radar: site,
      product,
      start: toIemBound(new Date(now - FRAME_LOOKBACK_MS)),
      end: toIemBound(new Date(now)),
    },
    timeout: API_TIMEOUT_MS,
  });
  increment("iem", "radar-list");

  const scans = Array.isArray(res.data?.scans) ? res.data.scans : [];
  const frames = scans
    .map((s) => {
      const stamp = toTileStamp(s?.ts);
      const epoch = toEpochMs(s?.ts);
      return stamp && epoch ? { stamp, ts: s.ts, epoch } : null;
    })
    .filter(Boolean)
    // IEM returns ascending, but sort explicitly rather than trusting it —
    // the frame age display and the "latest frame" pick both depend on
    // the last element genuinely being the newest.
    .sort((a, b) => a.epoch - b.epoch)
    .slice(-count);

  const value = { site, product, frames, generatedAt: new Date(now).toISOString() };
  framesCache.set(key, { value, expires: now + FRAMES_TTL_MS });
  recordServiceCall(SERVICE_NAME, 200, `${frames.length} frames for ${site}/${product}`);
  return value;
}

/**
 * GET /api/radar/frames?site=DIX&product=N0B&count=30
 *
 * The frame-list poller. Answers with the concrete scan timestamps that
 * build `ridge::<site>-<product>-<stamp>` tile URLs, plus each frame's
 * epoch so the client can show how old the displayed frame actually is.
 *
 * `site` may be omitted in favour of `lat`/`lon`, in which case the site
 * is resolved first — the common client path, since it means one request
 * instead of two on startup.
 *
 * @param {Object} req
 * @param {Object} res
 */
async function getRadarFrames(req, res) {
  const product = String(req.query.product || DEFAULT_PRODUCT).toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(product)) {
    return res.status(400).json("Invalid product").end();
  }

  let count = parseInt(req.query.count, 10);
  if (!Number.isFinite(count) || count < 1) count = DEFAULT_FRAME_COUNT;
  count = Math.min(count, MAX_FRAME_COUNT);

  // Always parse coordinates when present so failover can rank nearby
  // online radars relative to the map/pin even under a manual site pin.
  const rawLat = parseFloat(req.query.lat);
  const rawLon = parseFloat(req.query.lon);
  const validCoord = Number.isFinite(rawLat) && Number.isFinite(rawLon)
    && rawLat >= -90 && rawLat <= 90 && rawLon >= -180 && rawLon <= 180;
  const lat = validCoord ? rawLat : null;
  const lon = validCoord ? rawLon : null;

  // A manual override in settings beats both the explicit `site` query
  // and coordinate resolution — it is the user saying "this radar,
  // wherever the map is".
  let primarySite = (await overrideSite()) || normalizeSiteId(req.query.site);
  let resolvedCandidates = [];

  // Coordinate form: resolve the site first so the client can make a
  // single call on startup.
  if (!primarySite) {
    if (!validCoord) {
      return res.status(400).json("Provide either site, or valid lat and lon").end();
    }
    try {
      const resolved = await resolveRadarSite(lat, lon);
      primarySite = resolved.site;
      resolvedCandidates = Array.isArray(resolved.candidates) ? resolved.candidates : [];
    } catch {
      const [mosaic, satellite] = await Promise.all([fetchMosaicMeta(), fetchSatelliteMeta()]);
      return res.status(200).json({ available: false, frames: [], reason: "no-radar-coverage", mosaic, satellite }).end();
    }
  }

  let activeSite = primarySite;
  try {
    if (activeFailovers.has(primarySite)) {
      const fo = await resolveFailover(primarySite, { lat, lon, candidates: resolvedCandidates });
      activeSite = fo.site;
      const [payload, mosaic, satellite] = await Promise.all([
        fetchFrames(activeSite, product, count), fetchMosaicMeta(), fetchSatelliteMeta(),
      ]);
      return res.status(200).json({ available: true, ...payload, fallbackFrom: fo.fallbackFrom, mosaic, satellite }).end();
    }

    // The mosaic and satellite times ride along with every frame list so
    // the client's single 60 s poll refreshes every layer's age.
    const [payload, mosaic, satellite] = await Promise.all([
      fetchFrames(primarySite, product, count), fetchMosaicMeta(), fetchSatelliteMeta(),
    ]);
    if (framesAreStale(payload.frames)) {
      const fo = await resolveFailover(primarySite, { lat, lon, candidates: resolvedCandidates });
      if (fo.fallbackFrom && fo.site !== primarySite) {
        activeSite = fo.site;
        try {
          const fbPayload = await fetchFrames(fo.site, product, count);
          if (fbPayload.frames.length > 0 || payload.frames.length === 0) {
            return res.status(200).json({ available: true, ...fbPayload, fallbackFrom: primarySite, mosaic, satellite }).end();
          }
        } catch {
          // Fall through to returning primary payload when fallback fetch fails.
        }
      }
    }
    return res.status(200).json({ available: true, ...payload, fallbackFrom: null, mosaic, satellite }).end();
  } catch (err) {
    const status = err?.response?.status || 500;
    recordServiceCall(SERVICE_NAME, status, `frame list failed for ${activeSite}`);
    // 503 rather than 500: this is an upstream availability problem and
    // the client's correct response is to keep showing the last good
    // frame list flagged stale, not to treat the app as broken.
    return res.status(503).json({ available: false, frames: [], reason: "upstream-unavailable" }).end();
  }
}

module.exports = {
  getRadarSite,
  getRadarFrames,
  // Exported for tests and internal controllers.
  FAILOVER_MAX_KM,
  STALE_AFTER_MS,
  toTileStamp,
  toEpochMs,
  normalizeSiteId,
  distanceKm,
  framesAreStale,
  rankFallbackCandidates,
  pickOnlineFallback,
  isFailoverActive,
  resolveFailover,
  clearRadarCaches,
  resolveRadarSite,
  overrideSite,
  parseMosaicMeta,
  parseSatelliteMeta,
  fetchMosaicMeta,
};
