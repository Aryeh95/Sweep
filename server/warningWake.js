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
function activeWakeWarning(alerts, { level, quietHours, now }) {
  if (!Array.isArray(alerts) || level === "off") return null;
  const urgentOnly = level === "tornado" || inQuietHours(now, quietHours);
  const wanted = urgentOnly ? WAKE_URGENT : WAKE_SEVERE;
  for (const a of alerts) {
    if (!a || a.isTest || !wanted.has(a.eventType)) continue;
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
