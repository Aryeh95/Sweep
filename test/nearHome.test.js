// "Near home" lines on the nowcast card (server/nearHome.js).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nearestFlash, homeWarnings } = require("../server/nearHome");

const home = { lat: 39.4, lon: -76.62 };

test("nearestFlash: picks the closest flash, with bearing from home and age now", () => {
  const flashes = [
    [39.4 + 0.5, -76.62, 30],        // ~56 km N
    [39.4, -76.62 - 0.1, 90],        // ~8.6 km W, 1.5 min old when fetched
    [39.4 - 0.05, -76.62 + 0.05, 10], // ~7 km SE — the nearest
  ];
  const r = nearestFlash(flashes, home, { fetchedAt: 1000, nowMs: 1000 + 60000 });
  assert.ok(r.distanceKm > 6 && r.distanceKm < 8, `distance ${r.distanceKm}`);
  assert.ok(r.bearingDeg > 120 && r.bearingDeg < 150, `bearing ${r.bearingDeg}`);
  assert.equal(r.ageMin, 1); // 10 s + 60 s since fetch
});

test("nearestFlash: nothing within range (or no data) gives null", () => {
  assert.equal(nearestFlash([[41.5, -76.62, 5]], home, { fetchedAt: 0, nowMs: 0 }), null); // ~233 km
  assert.equal(nearestFlash([], home, { fetchedAt: 0, nowMs: 0 }), null);
  assert.equal(nearestFlash(null, home, { fetchedAt: 0, nowMs: 0 }), null);
  const due = nearestFlash([[39.4 + 0.1, -76.62, 0]], home, { fetchedAt: 0, nowMs: 0 });
  assert.ok(due.bearingDeg < 1 || due.bearingDeg > 359, "due north");
});

test("homeWarnings: warnings only, no tests, nothing expired", () => {
  const now = Date.parse("2026-10-11T20:00:00Z");
  const list = [
    { eventType: "Tornado Warning", expiresAt: "2026-10-11T20:45:00Z" },
    { eventType: "Tornado Watch", expiresAt: "2026-10-11T23:00:00Z" },
    { eventType: "Flood Advisory" },
    { eventType: "Special Weather Statement" },
    { eventType: "Severe Thunderstorm Warning", isTest: true },
    { eventType: "Flash Flood Warning", expiresAt: "2026-10-11T19:00:00Z" },
    { eventType: "Winter Storm Warning" },
  ];
  assert.deepEqual(homeWarnings(list, now).map((a) => a.eventType), ["Tornado Warning", "Winter Storm Warning"]);
  assert.deepEqual(homeWarnings(null, now), []);
});
