// Offline radars for the site picker (server/radarStatusCtrl.js).
//
// The records below are trimmed from the live NWS /radar/stations feed of
// 2026-10-05 13:45 Z, the morning RadarScope showed EOX, EVX, MOB and VAX
// in red. They pin the two findings the rule is built on: an outage can
// keep a healthy-looking status ("Operate" / "RDA - On-line" / "No
// Alarms", 56 h without data), and "Maintenance Action Mandatory" is a
// maintenance flag on radars that are streaming normally (LWX, DIX).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { classifyStation, summarizeStations, OFFLINE_AFTER_MIN } = require("../server/radarStatusCtrl");

const NOW = Date.parse("2026-10-05T13:46:00Z");
const station = (id, l2, status, operability) => ({
  properties: {
    id,
    stationType: "WSR-88D",
    latency: l2 === undefined ? undefined : { levelTwoLastReceivedTime: l2 },
    rda: { properties: { status, operabilityStatus: operability } },
  },
});

const FEED = {
  features: [
    // Streaming, with a maintenance flag.
    station("KLWX", "2026-10-05T13:45:25+00:00", "Operate", "RDA - Maintenance Action Mandatory"),
    station("KDIX", "2026-10-05T13:45:31+00:00", "Operate", "RDA - Maintenance Action Mandatory"),
    // Silent for 56 h, status still says all is well.
    station("KEOX", "2026-10-03T05:47:00+00:00", "Operate", "RDA - On-line"),
    // Silent for ~6 days AND reporting itself down.
    station("KVAX", "2026-09-29T13:00:00+00:00", "Start-Up", "RDA - Inoperable"),
    // Overseas DoD site with no latency block in the feed.
    station("RODN", undefined, undefined, undefined),
    // Not a WSR-88D: ignored.
    { properties: { id: "TDCA", stationType: "TDWR", latency: { levelTwoLastReceivedTime: "2026-10-05T13:45:00+00:00" } } },
  ],
};

test("a streaming radar with a maintenance flag is online", () => {
  const s = classifyStation(FEED.features[0].properties, NOW);
  assert.equal(s.state, "online");
  assert.equal(s.reason, null);
  assert.equal(s.ageMin, 1);
});

test("a radar silent past the threshold is offline even when its status reads healthy", () => {
  const s = classifyStation(FEED.features[2].properties, NOW);
  assert.equal(s.state, "offline");
  assert.equal(s.reason, "no-data");
  assert.ok(s.ageMin > 55 * 60, `age ${s.ageMin}`);
  assert.equal(s.status, "Operate");
});

test("the threshold is the boundary: 15 min is a slow scan, 16 is an outage", () => {
  const at = (min) => classifyStation(station("KXXX", new Date(NOW - min * 60000).toISOString(), "Operate", "RDA - On-line").properties, NOW);
  assert.equal(OFFLINE_AFTER_MIN, 15);
  assert.equal(at(15).state, "online");
  assert.equal(at(16).state, "offline");
});

test("a radar reporting itself inoperable is offline even with fresh data", () => {
  const fresh = classifyStation(station("KLRX", "2026-10-05T13:45:30+00:00", "Start-Up", "RDA - Inoperable").properties, NOW);
  assert.equal(fresh.state, "offline");
  assert.equal(fresh.reason, "inoperable");
  const vax = classifyStation(FEED.features[3].properties, NOW);
  assert.equal(vax.state, "offline");
  assert.equal(vax.reason, "no-data", "age is the stronger statement when both apply");
});

test("no latency block is unknown, not offline", () => {
  assert.equal(classifyStation(FEED.features[4].properties, NOW).state, "unknown");
  assert.equal(classifyStation({}, NOW).state, "unknown");
});

test("summarizeStations keys by the 3-letter id and keeps only WSR-88Ds", () => {
  const out = summarizeStations(FEED, NOW);
  assert.deepEqual(Object.keys(out).sort(), ["DIX", "EOX", "LWX", "ODN", "VAX"]);
  assert.equal(out.LWX.state, "online");
  assert.equal(out.EOX.state, "offline");
  assert.deepEqual(summarizeStations(null, NOW), {});
});
