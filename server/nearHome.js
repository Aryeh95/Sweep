// "Near home" lines on the nowcast card (2026-10-11): the nearest lightning
// flash and the warnings in effect at the pin.
//
// Plain CommonJS, no Node built-ins — the client imports it straight from
// server/ (like warningWake.js / precipType.js), and the tests require it.

const KM_PER_DEG = 111.32;
// Beyond this a flash is not "near home" — the card says none is near.
const NEAR_FLASH_KM = 80; // ≈ 50 mi

/**
 * The nearest lightning flash to home, from /api/lightning's flash list.
 *
 * Flashes arrive as [lat, lon, ageSeconds] with the age measured when the
 * server answered; `fetchedAt` / `nowMs` age them to the moment of reading.
 *
 * @param {Array<Array<Number>>} flashes [lat, lon, ageSec] triples
 * @param {{lat: Number, lon: Number}} home pin
 * @param {Object} opts
 * @param {Number} opts.fetchedAt epoch ms the list was received
 * @param {Number} opts.nowMs current epoch ms
 * @param {Number} [opts.maxKm] search radius
 * @returns {{distanceKm: Number, bearingDeg: Number, ageMin: Number}|null} null when none is within maxKm
 */
function nearestFlash(flashes, home, { fetchedAt, nowMs, maxKm = NEAR_FLASH_KM }) {
  if (!Array.isArray(flashes) || !home) return null;
  const cosLat = Math.cos((home.lat * Math.PI) / 180);
  let best = null;
  for (const f of flashes) {
    if (!Array.isArray(f) || f.length < 3) continue;
    const dy = (f[0] - home.lat) * KM_PER_DEG;
    const dx = (f[1] - home.lon) * KM_PER_DEG * cosLat;
    const d = Math.hypot(dx, dy);
    if (d > maxKm || (best && d >= best.d)) continue;
    best = { d, dx, dy, ageSec: f[2] };
  }
  if (!best) return null;
  const extraSec = Number.isFinite(fetchedAt) && Number.isFinite(nowMs) ? Math.max(0, (nowMs - fetchedAt) / 1000) : 0;
  return {
    distanceKm: best.d,
    bearingDeg: ((Math.atan2(best.dx, best.dy) * 180) / Math.PI + 360) % 360,
    ageMin: Math.max(0, Math.round((best.ageSec + extraSec) / 60)),
  };
}

/**
 * Warnings in effect at home, from the point-alert list (which only holds
 * alerts whose area covers the pin). Watches, advisories, statements and
 * test messages are left out; expired ones too.
 *
 * @param {Array<Object>} alerts /api/weather-alerts list
 * @param {Number} nowMs current epoch ms
 * @returns {Array<Object>} warnings, in the list's (severity) order
 */
function homeWarnings(alerts, nowMs) {
  if (!Array.isArray(alerts)) return [];
  return alerts.filter((a) => {
    if (!a || a.isTest || typeof a.eventType !== "string") return false;
    if (!/\bWarning\b/.test(a.eventType)) return false;
    const expires = Date.parse(a.expiresAt || "");
    return !(Number.isFinite(expires) && expires <= nowMs);
  });
}

module.exports = { NEAR_FLASH_KM, nearestFlash, homeWarnings };
