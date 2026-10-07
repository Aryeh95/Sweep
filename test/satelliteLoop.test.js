// Satellite loop frame choice (client/src/ui/satelliteLoop.js): which
// GOES-East scans the timeline loads, and which one each playhead shows.
//
// The copy below is kept identical to the source by test/verbatimSync.test.js.
//
// Run: `npm test`

const { test } = require("node:test");
const assert = require("node:assert/strict");

// ---------- start of verbatim copy from client/src/ui/satelliteLoop.js ----------
const SAT_LOOP_MAX_FRAMES = 12;
const SAT_SCAN_MS = 5 * 60 * 1000;
// A radar frame and the satellite scan "at" it can be a couple of
// minutes apart either way (scan start times vs. volume-scan times).
const SAT_PICK_TOLERANCE_MS = 150 * 1000;

/**
 * Scans to load for a timeline spanning [fromMs, toMs], oldest first:
 * every scan in the span (plus one scan of slack before it) when they
 * fit, otherwise every Nth counting back from the newest.
 *
 * @param {Array<{stamp: String, epoch: Number}>} scans available scans, oldest first
 * @param {Number} fromMs oldest timeline time
 * @param {Number} toMs newest timeline time that needs a loop frame
 * @param {Number} [max] frame budget
 * @returns {Array<{stamp: String, epoch: Number}>} chosen scans, oldest first
 */
function thinScans(scans, fromMs, toMs, max = SAT_LOOP_MAX_FRAMES) {
  const inSpan = (scans || []).filter((s) => s.epoch >= fromMs - SAT_SCAN_MS && s.epoch <= toMs + SAT_PICK_TOLERANCE_MS);
  if (inSpan.length <= max) return inSpan;
  const stride = Math.ceil(inSpan.length / max);
  const out = [];
  for (let i = inSpan.length - 1; i >= 0; i -= stride) out.unshift(inSpan[i]);
  return out;
}

/**
 * The scan to show at a playhead time: the newest chosen scan at or
 * before it, or null when the nearest one is further back than the loop's
 * own spacing (the layer hides rather than claim a time it does not have).
 *
 * @param {Array<{stamp: String, epoch: Number}>} scans chosen scans (thinScans)
 * @param {Number} epoch playhead time, ms
 * @returns {{stamp: String, epoch: Number}|null} scan, or null
 */
function pickScan(scans, epoch) {
  if (!scans || !scans.length || !Number.isFinite(epoch)) return null;
  let spacing = SAT_SCAN_MS;
  for (let i = 1; i < scans.length; i += 1) spacing = Math.max(spacing, scans[i].epoch - scans[i - 1].epoch);
  let best = null;
  for (const s of scans) {
    if (s.epoch <= epoch + SAT_PICK_TOLERANCE_MS && (!best || s.epoch > best.epoch)) best = s;
  }
  if (!best || epoch - best.epoch > spacing + SAT_PICK_TOLERANCE_MS) return null;
  return best;
}
// ---------- end of verbatim copy ----------

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 7, 12, 0, 17);
// A scan every 5 minutes for 3 hours, the way the bucket lists them.
const SCANS = Array.from({ length: 37 }, (_, i) => ({ stamp: `s${i}`, epoch: T0 + i * 5 * MIN }));

test("a 50-minute mosaic track loads every scan in it", () => {
  const to = SCANS[36].epoch;
  const chosen = thinScans(SCANS, to - 50 * MIN, to);
  assert.equal(chosen.length, 12); // 50 min of 5-min scans plus one of slack
  assert.equal(chosen[chosen.length - 1].stamp, "s36");
  for (let i = 1; i < chosen.length; i += 1) assert.equal(chosen[i].epoch - chosen[i - 1].epoch, 5 * MIN);
});

test("a 2.5-hour site track is thinned to the budget, anchored on the newest scan", () => {
  const to = SCANS[36].epoch;
  const chosen = thinScans(SCANS, to - 150 * MIN, to);
  assert.ok(chosen.length <= SAT_LOOP_MAX_FRAMES);
  assert.equal(chosen[chosen.length - 1].stamp, "s36");
  assert.ok(chosen[0].epoch <= to - 135 * MIN, "still reaches the start of the track");
  const gaps = new Set(chosen.slice(1).map((s, i) => s.epoch - chosen[i].epoch));
  assert.deepEqual([...gaps], [15 * MIN]);
});

test("the playhead shows the newest scan at (or just after) its time", () => {
  const chosen = SCANS.slice(20, 30);
  // Radar frame 2 min after a scan → that scan.
  assert.equal(pickScan(chosen, SCANS[25].epoch + 2 * MIN).stamp, "s25");
  // Radar frame 1 min BEFORE a scan start still counts as that scan (tolerance).
  assert.equal(pickScan(chosen, SCANS[25].epoch - 1 * MIN).stamp, "s25");
  // 3 min before → the previous scan.
  assert.equal(pickScan(chosen, SCANS[25].epoch - 3 * MIN).stamp, "s24");
});

test("a playhead older than the loaded scans shows nothing rather than the oldest", () => {
  const chosen = SCANS.slice(20, 30);
  assert.equal(pickScan(chosen, SCANS[20].epoch - 30 * MIN), null);
  assert.equal(pickScan([], T0), null);
  assert.equal(pickScan(chosen, NaN), null);
});

test("on a thinned loop each scan covers its whole 15-minute step", () => {
  const to = SCANS[36].epoch;
  const chosen = thinScans(SCANS, to - 150 * MIN, to);
  const mid = chosen[3].epoch + 12 * MIN; // past 12.5 min the next scan is "at" the playhead (tolerance)
  assert.equal(pickScan(chosen, mid).stamp, chosen[3].stamp);
});
