// Which warning at home should keep a sleeping kiosk awake?
//
// Plain CommonJS, no Node built-ins: the kiosk client imports it straight
// from server/ like precipType.js, and the tests require it.
//
// Rules (2026-10-11):
//   - Only warnings whose area covers the HOME point reach this: the list
//     is the point query (/api/weather-alerts?lat&lon), not the radius
//     survey.
//   - While a qualifying warning is in effect the screen stays awake: it
//     wakes when the warning arrives and does not drop back into the
//     screensaver until the warning ends. Waking once and then dimming
//     again ten minutes into a tornado warning would hide the map exactly
//     when it matters, and holding (rather than re-waking) also means a
//     warning's updates never flash the screen.
//   - Level "severe" covers the life-safety short-fuse warnings; "tornado"
//     the most dangerous only; "off" none.
//   - Quiet hours narrow any level to the "tornado" set.

const WAKE_SEVERE = new Set([
  "Tornado Warning",
  "Extreme Wind Warning",
  "Severe Thunderstorm Warning",
  "Flash Flood Warning",
  "Snow Squall Warning",
  "Tsunami Warning",
]);
// Quiet-hours override and the "tornado" level.
const WAKE_URGENT = new Set(["Tornado Warning", "Extreme Wind Warning", "Tsunami Warning"]);

const WAKE_SEVERE_LOWER = new Set([...WAKE_SEVERE].map((s) => s.toLowerCase()));
const WAKE_URGENT_LOWER = new Set([...WAKE_URGENT].map((s) => s.toLowerCase()));
// Bare ECCC `alert_code` slugs when `title_en` carries the "warning" word.
const WAKE_SEVERE_BARE = new Set([
  "tornado",
  "extreme wind",
  "severe thunderstorm",
  "flash flood",
  "snow squall",
  "tsunami",
]);
const WAKE_URGENT_BARE = new Set(["tornado", "extreme wind", "tsunami"]);
const NON_WARNING_RE = /\b(watch|advisory|statement|veille|avis|bulletin)\b/i;

const WAKE_LEVELS = ["severe", "tornado", "off"];
// "start-end" in local hours, wrapping past midnight; "off" = none.
const QUIET_HOURS = ["off", "22-6", "23-7", "0-6"];

/**
 * Is `date` inside the quiet-hours window?
 *
 * @param {Date} date local time
 * @param {String} spec one of QUIET_HOURS
 * @returns {Boolean}
 */
function inQuietHours(date, spec) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(spec || "");
  if (!m) return false;
  const start = Number(m[1]);
  const end = Number(m[2]);
  const h = date.getHours();
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

/**
 * The warning that should keep the kiosk awake right now, if any.
 *
 * @param {Array<Object>} alerts point alerts at home
 * @param {Object} opts
 * @param {String} opts.level one of WAKE_LEVELS
 * @param {String} opts.quietHours one of QUIET_HOURS
 * @param {Date} opts.now current time
 * @returns {Object|null} the first qualifying warning in effect
 */
function matchesWakeWarning(a, urgentOnly) {
  const wanted = urgentOnly ? WAKE_URGENT : WAKE_SEVERE;
  const wantedLower = urgentOnly ? WAKE_URGENT_LOWER : WAKE_SEVERE_LOWER;
  const wantedBare = urgentOnly ? WAKE_URGENT_BARE : WAKE_SEVERE_BARE;
  const evRaw = typeof a.eventType === "string" ? a.eventType.trim() : "";
  const titleRaw = typeof a.title_en === "string" ? a.title_en.trim() : "";
  if (wanted.has(evRaw) || wanted.has(titleRaw)) return true;
  const ev = evRaw.toLowerCase();
  const title = titleRaw.toLowerCase();
  if (wantedLower.has(ev) || wantedLower.has(title)) return true;
  if (wantedBare.has(ev) && /\bwarning\b/.test(title) && !NON_WARNING_RE.test(title)) {
    return true;
  }
  return false;
}

function activeWakeWarning(alerts, { level, quietHours, now }) {
  if (!Array.isArray(alerts) || level === "off") return null;
  const urgentOnly = level === "tornado" || inQuietHours(now, quietHours);
  for (const a of alerts) {
    if (!a || typeof a !== "object" || a.isTest || !matchesWakeWarning(a, urgentOnly)) continue;
    const expires = Date.parse(a.expiresAt || "");
    if (Number.isFinite(expires) && expires <= now.getTime()) continue;
    return a;
  }
  return null;
}

module.exports = {
  WAKE_SEVERE,
  WAKE_URGENT,
  WAKE_LEVELS,
  QUIET_HOURS,
  inQuietHours,
  activeWakeWarning,
};
