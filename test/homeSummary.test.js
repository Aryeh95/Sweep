// Home Assistant summary (server/homeSummary.js) — the card's rules, flat.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { summarizeNowcast, summarizeLightning, buildHomeSummary, compass } = require("../server/homeSummary");

const T0 = Date.parse("2026-11-05T20:00:00Z");
const step = (leadMin, prob, extra = {}) => ({ leadMin, prob, dbz: prob >= 0.5 ? 25 : null, category: prob >= 0.5 ? "light" : "none", ptype: prob >= 0.5 ? "rain" : "none", ...extra });
const series = (probs) => probs.map((p, i) => step(i * 5, p));
const nowcast = (over) => ({
  available: true, site: "LWX", scanTime: new Date(T0).toISOString(), horizonMin: 90,
  now: { raining: false, prob: 0, category: "none", ptype: "none" },
  arrival: null, peak: null, end: null, motion: { vx: 1, vy: 0 }, motionReason: null,
  series: series([0, 0, 0, 0, 0, 0]),
  ...over,
});

test("dry: state dry, no arrival, highest chance ahead reported", () => {
  const s = summarizeNowcast(nowcast({ series: series([0, 0.1, 0.3, 0.2]) }), T0 + 60000);
  assert.equal(s.state, "dry");
  assert.equal(s.raining, false);
  assert.equal(s.rain_in_min, null);
  assert.equal(s.rain_probability, 30);
  assert.equal(s.radar_age_min, 1);
  assert.equal(s.nowcast_available, true);
});

test("arriving: leads are shifted to minutes from NOW, never below 1", () => {
  const nc = nowcast({
    series: series([0, 0, 0, 0.4, 0.7, 0.8, 0.8]),
    arrival: { leadMin: 20, earliestMin: 15, latestMin: 30, prob: 0.7, category: "light", ptype: "rain" },
    peak: { leadMin: 25, category: "moderate" },
    end: { leadMin: 45, prob: 0.2 },
  });
  const s = summarizeNowcast(nc, T0 + 4 * 60000); // read 4 min after the scan
  assert.equal(s.state, "arriving");
  assert.equal(s.rain_in_min, 16);
  assert.equal(s.rain_in_min_earliest, 11);
  assert.equal(s.rain_in_min_latest, 26);
  assert.equal(s.rain_probability, 70);
  assert.equal(s.intensity, "moderate");
  assert.equal(s.precip_type, "rain");
  assert.equal(s.rain_ends_in_min, 41);
});

test("an arrival already past at reading time is judged at the current step instead", () => {
  const nc = nowcast({
    series: series([0, 0.9, 0.9, 0.9]),
    arrival: { leadMin: 5, earliestMin: 5, latestMin: 5, prob: 0.9, category: "light", ptype: "snow" },
  });
  nc.series[1].ptype = "snow";
  const s = summarizeNowcast(nc, T0 + 6 * 60000); // step nearest 6 min = +5
  assert.equal(s.state, "raining");
  assert.equal(s.raining, true);
  assert.equal(s.rain_in_min, 0);
  assert.equal(s.precip_type, "snow");
});

test("raining now with an end", () => {
  const nc = nowcast({
    now: { raining: true, prob: 0.95, category: "heavy", ptype: "rain" },
    series: series([0.95, 0.9, 0.6, 0.1]),
    end: { leadMin: 15, prob: 0.1 },
  });
  const s = summarizeNowcast(nc, T0);
  assert.equal(s.state, "raining");
  assert.equal(s.intensity, "heavy");
  assert.equal(s.rain_ends_in_min, 15);
  assert.equal(s.rain_probability, 95);
});

test("motion low-correlation reads unclear; a scan over 20 min old forecasts nothing", () => {
  assert.equal(summarizeNowcast(nowcast({ motion: null, motionReason: "low-correlation" }), T0).state, "unclear");
  const late = summarizeNowcast(nowcast({}), T0 + 21 * 60000);
  assert.equal(late.state, "unknown");
  assert.equal(late.nowcast_reason, "delayed");
  assert.equal(late.radar_age_min, 21);
});

test("unavailable nowcast keeps its reason; a failed request says unavailable", () => {
  const s = summarizeNowcast({ available: false, site: "DIX", reason: "no-recent-scans" }, T0);
  assert.equal(s.state, "unknown");
  assert.equal(s.nowcast_reason, "no-recent-scans");
  assert.equal(s.radar_site, "DIX");
  assert.equal(summarizeNowcast(null, T0).nowcast_reason, "unavailable");
});

test("lightning: nearest flash in km and mi, compass direction, aged to the reading", () => {
  const home = { lat: 39.37, lon: -76.72 };
  // ~11.1 km due north, 60 s old when the server answered, read 60 s later.
  const lt = { available: true, windowMinutes: 5, generatedAt: new Date(T0).toISOString(), flashes: [[39.47, -76.72, 60], [40.0, -76.72, 10]] };
  const s = summarizeLightning(lt, home, T0 + 60000);
  assert.equal(s.lightning_available, true);
  assert.equal(s.lightning_flashes, 2);
  assert.equal(s.lightning_km, 11.1);
  assert.equal(s.lightning_mi, 6.9);
  assert.equal(s.lightning_direction, "N");
  assert.equal(s.lightning_age_min, 2);
  const none = summarizeLightning({ ...lt, flashes: [] }, home, T0);
  assert.equal(none.lightning_available, true);
  assert.equal(none.lightning_flashes, 0);
  assert.equal(none.lightning_km, null);
  assert.equal(summarizeLightning(null, home, T0).lightning_available, false);
});

test("buildHomeSummary is flat JSON with no coordinates in it", () => {
  const out = buildHomeSummary({ nowcast: nowcast({}), lightning: null, home: { lat: 39.37, lon: -76.72 }, nowMs: T0 });
  for (const v of Object.values(out)) assert.ok(v === null || typeof v !== "object", "nested values would need HA attribute templates");
  const text = JSON.stringify(out);
  assert.ok(!text.includes("39.37") && !text.includes("76.72"), "home location must not leak onto the LAN");
  assert.equal(compass(350), "N");
  assert.equal(compass(225), "SW");
});
