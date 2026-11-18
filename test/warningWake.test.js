// Wake-for-warnings rules (server/warningWake.js): which warning at home
// keeps a sleeping kiosk awake.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { inQuietHours, activeWakeWarning } = require("../server/warningWake");

const at = (h) => new Date(2026, 9, 11, h, 30);
const warn = (eventType, extra = {}) => ({ id: eventType, eventType, expiresAt: "2099-01-01T00:00:00Z", ...extra });

test("inQuietHours wraps past midnight", () => {
  assert.equal(inQuietHours(at(23), "22-6"), true);
  assert.equal(inQuietHours(at(3), "22-6"), true);
  assert.equal(inQuietHours(at(6), "22-6"), false);
  assert.equal(inQuietHours(at(12), "22-6"), false);
  assert.equal(inQuietHours(at(3), "0-6"), true);
  assert.equal(inQuietHours(at(3), "off"), false);
});

test("activeWakeWarning: a severe warning at home qualifies", () => {
  const svr = warn("Severe Thunderstorm Warning");
  assert.equal(activeWakeWarning([svr], { level: "severe", quietHours: "off", now: at(15) }), svr);
  assert.equal(activeWakeWarning([warn("Flash Flood Warning")], { level: "severe", quietHours: "off", now: at(15) }).eventType, "Flash Flood Warning");
});

test("activeWakeWarning: watches, advisories, tests and expired warnings never qualify", () => {
  const opts = { level: "severe", quietHours: "off", now: at(15) };
  assert.equal(activeWakeWarning([warn("Tornado Watch")], opts), null);
  assert.equal(activeWakeWarning([warn("Wind Advisory")], opts), null);
  assert.equal(activeWakeWarning([warn("Tornado Warning", { isTest: true })], opts), null);
  assert.equal(activeWakeWarning([warn("Tornado Warning", { expiresAt: "2020-01-01T00:00:00Z" })], opts), null);
  assert.equal(activeWakeWarning(null, opts), null);
});

test("activeWakeWarning: quiet hours and the tornado level keep only the urgent set", () => {
  const svr = warn("Severe Thunderstorm Warning");
  const tor = warn("Tornado Warning");
  assert.equal(activeWakeWarning([svr], { level: "severe", quietHours: "22-6", now: at(2) }), null);
  assert.equal(activeWakeWarning([svr, tor], { level: "severe", quietHours: "22-6", now: at(2) }), tor);
  assert.equal(activeWakeWarning([svr], { level: "tornado", quietHours: "off", now: at(15) }), null);
  assert.equal(activeWakeWarning([tor], { level: "off", quietHours: "off", now: at(15) }), null);
});

test("activeWakeWarning: ECCC Canadian warnings qualify while ECCC watches/statements do not", () => {
  const ecccTor = warn("Tornado warning", { source: "ECCC", title_en: "Tornado warning" });
  const ecccLegacy = warn("tornado", { source: "ECCC", title_en: "Tornado warning" });
  const ecccSquall = warn("Snow squall warning", { source: "ECCC", title_en: "Snow squall warning" });
  const ecccWatch = warn("Tornado watch", { source: "ECCC", title_en: "Tornado watch" });
  assert.equal(activeWakeWarning([ecccTor], { level: "tornado", quietHours: "off", now: at(3) }), ecccTor);
  assert.equal(activeWakeWarning([ecccLegacy], { level: "tornado", quietHours: "off", now: at(3) }), ecccLegacy);
  assert.equal(activeWakeWarning([ecccSquall], { level: "severe", quietHours: "off", now: at(14) }), ecccSquall);
  assert.equal(activeWakeWarning([ecccSquall], { level: "tornado", quietHours: "off", now: at(14) }), null);
  assert.equal(activeWakeWarning([ecccWatch], { level: "severe", quietHours: "off", now: at(14) }), null);
});
