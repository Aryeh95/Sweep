// Home summary for Home Assistant — the nowcast card's answer and the
// nearest lightning, as flat values an HA REST sensor can template.
//
// Pure: takes the /api/radar/nowcast and /api/lightning payloads and the
// time of reading, so it is testable without a network. haBridge.js
// fetches the payloads and serves the result.
//
// The rules MIRROR the NowcastPanel card, so the kiosk and HA never
// disagree about the same scan:
//   - leads are measured from the scan and shifted to "from now";
//   - "raining now" is judged at the scan's current age (the step nearest
//     the elapsed minutes), not at the scan itself;
//   - an arrival already in the past is not an arrival;
//   - a scan older than 20 min forecasts nothing (the card's "delayed").
// If one of those changes in the card, change it here.

const { nearestFlash, NEAR_FLASH_KM } = require("./nearHome");

// = NowcastPanel's NOWCAST_MAX_SCAN_AGE_MIN.
const MAX_SCAN_AGE_MIN = 20;
// = nowcastCtrl's P_RAIN, the card's "raining" threshold.
const P_RAIN = 0.5;
const KM_PER_MI = 1.609344;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * Eight-point compass name for a bearing.
 *
 * @param {Number} deg bearing, degrees clockwise from north
 * @returns {String} e.g. "NE"
 */
function compass(deg) {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

const round1 = (x) => Math.round(x * 10) / 10;
const pct = (p) => Math.round((p ?? 0) * 100);
const typeOf = (x) => (x && x.ptype && x.ptype !== "none" ? x.ptype : "rain");

/**
 * The nowcast half of the summary.
 *
 * `state` is one of:
 *   raining  — precipitation at home now
 *   arriving — expected within the horizon (`rain_in_min`)
 *   unclear  — echo near home whose scans do not agree on its motion
 *   dry      — nothing expected within the horizon
 *   unknown  — no usable nowcast (`nowcast_reason` says why)
 *
 * @param {Object|null} nc /api/radar/nowcast payload, or null when it failed
 * @param {Number} nowMs epoch ms of reading
 * @returns {Object} flat fields
 */
function summarizeNowcast(nc, nowMs) {
  const out = {
    state: "unknown",
    raining: null,
    precip_type: null,
    intensity: null,
    rain_in_min: null,
    rain_in_min_earliest: null,
    rain_in_min_latest: null,
    rain_probability: null,
    rain_ends_in_min: null,
    horizon_min: null,
    nowcast_available: false,
    nowcast_reason: null,
    radar_site: nc && nc.site ? nc.site : null,
    scan_time: null,
    radar_age_min: null,
  };
  if (!nc) return { ...out, nowcast_reason: "unavailable" };
  if (!nc.available) return { ...out, nowcast_reason: nc.reason || "unavailable" };
  const scanMs = Date.parse(nc.scanTime);
  if (!Number.isFinite(scanMs)) return { ...out, nowcast_reason: "unavailable" };
  const elapsed = Math.max(0, Math.round((nowMs - scanMs) / 60000));
  out.scan_time = nc.scanTime;
  out.radar_age_min = elapsed;
  if (elapsed > MAX_SCAN_AGE_MIN) return { ...out, nowcast_reason: "delayed" };

  const series = Array.isArray(nc.series) ? nc.series : [];
  const fromNow = (lead) => Math.max(1, lead - elapsed);
  const nowIdx = Math.min(series.length - 1, Math.round(elapsed / 5));
  const nowStep = nowIdx > 0 ? series[nowIdx] : null;
  const current = nowStep
    ? { raining: nowStep.prob >= P_RAIN, prob: nowStep.prob, category: nowStep.category, ptype: nowStep.ptype }
    : (nc.now || { raining: false });
  const { arrival, peak, end } = nc;
  out.nowcast_available = true;
  out.horizon_min = nc.horizonMin ?? null;

  if (current.raining) {
    return {
      ...out,
      state: "raining",
      raining: true,
      precip_type: typeOf(current),
      intensity: current.category || null,
      rain_in_min: 0,
      rain_probability: pct(current.prob),
      rain_ends_in_min: end ? fromNow(end.leadMin) : null,
    };
  }
  if (arrival && arrival.leadMin > elapsed) {
    return {
      ...out,
      state: "arriving",
      raining: false,
      precip_type: typeOf(arrival),
      intensity: (peak ? peak.category : arrival.category) || null,
      rain_in_min: fromNow(arrival.leadMin),
      rain_in_min_earliest: fromNow(arrival.earliestMin ?? arrival.leadMin),
      rain_in_min_latest: arrival.latestMin != null ? fromNow(arrival.latestMin) : null,
      rain_probability: pct(arrival.prob),
      rain_ends_in_min: end ? fromNow(end.leadMin) : null,
    };
  }
  // Dry: the highest chance still ahead, so "dry" never hides a 40 % step.
  const ahead = series.filter((x) => x.leadMin >= elapsed);
  const maxProb = ahead.reduce((m, x) => Math.max(m, x.prob ?? 0), 0);
  return {
    ...out,
    state: !nc.motion && nc.motionReason === "low-correlation" ? "unclear" : "dry",
    raining: false,
    precip_type: "none",
    intensity: "none",
    rain_probability: pct(maxProb),
  };
}

/**
 * The lightning half of the summary.
 *
 * @param {Object|null} lt /api/lightning payload for NEAR_FLASH_KM, or null when it failed
 * @param {{lat: Number, lon: Number}} home
 * @param {Number} nowMs epoch ms of reading
 * @returns {Object} flat fields; distances null when no flash is within range
 */
function summarizeLightning(lt, home, nowMs) {
  const out = {
    lightning_available: false,
    lightning_flashes: null,
    lightning_km: null,
    lightning_mi: null,
    lightning_direction: null,
    lightning_bearing_deg: null,
    lightning_age_min: null,
    lightning_range_km: NEAR_FLASH_KM,
    lightning_window_min: null,
  };
  if (!lt || !lt.available) return out;
  const fetchedAt = Date.parse(lt.generatedAt || "");
  const near = nearestFlash(lt.flashes, home, { fetchedAt, nowMs, maxKm: NEAR_FLASH_KM });
  return {
    ...out,
    lightning_available: true,
    lightning_flashes: Array.isArray(lt.flashes) ? lt.flashes.length : 0,
    lightning_window_min: lt.windowMinutes ?? null,
    ...(near ? {
      lightning_km: round1(near.distanceKm),
      lightning_mi: round1(near.distanceKm / KM_PER_MI),
      lightning_direction: compass(near.bearingDeg),
      lightning_bearing_deg: Math.round(near.bearingDeg),
      lightning_age_min: near.ageMin,
    } : {}),
  };
}

/**
 * The whole summary.
 *
 * @param {Object} parts
 * @param {Object|null} parts.nowcast /api/radar/nowcast payload
 * @param {Object|null} parts.lightning /api/lightning payload
 * @param {{lat: Number, lon: Number}} parts.home
 * @param {Number} parts.nowMs
 * @returns {Object} flat JSON for /summary
 */
function buildHomeSummary({ nowcast, lightning, home, nowMs }) {
  return {
    available: true,
    updated: new Date(nowMs).toISOString(),
    ...summarizeNowcast(nowcast, nowMs),
    ...summarizeLightning(lightning, home, nowMs),
  };
}

module.exports = {
  buildHomeSummary,
  summarizeNowcast,
  summarizeLightning,
  compass,
  MAX_SCAN_AGE_MIN,
};
