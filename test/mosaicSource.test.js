// Low-zoom mosaic source (client/src/ui/mosaicSource.js): which MRMS files
// make the timeline, and when MRMS is current enough to replace IEM.
//
// The copy below is kept identical to the source by test/verbatimSync.test.js.
//
// Run: `npm test`

const { test } = require("node:test");
const assert = require("node:assert/strict");

// ---------- start of verbatim copy from client/src/ui/mosaicSource.js ----------
const MOSAIC_FRAME_COUNT = 11;
const MOSAIC_STEP_MS = 5 * 60 * 1000;
const MOSAIC_PICK_TOLERANCE_MS = 150 * 1000;
// MRMS publishes every ~2 min; ten minutes without a file means it is down
// (or the bucket listing is), and the IEM tiles take over.
const MRMS_STALE_MS = 10 * 60 * 1000;

/**
 * Timeline frames from the MRMS file list.
 *
 * @param {Array<{stamp: String, epoch: Number}>} list files, oldest first
 * @param {Number} [count] frames wanted
 * @param {Number} [stepMs] spacing between frames
 * @param {Number} [toleranceMs] largest |file − step| accepted
 * @returns {Array<{stamp: String, epoch: Number}>} chosen files, oldest first
 */
function pickMrmsFrames(list, count = MOSAIC_FRAME_COUNT, stepMs = MOSAIC_STEP_MS, toleranceMs = MOSAIC_PICK_TOLERANCE_MS) {
  if (!list || !list.length) return [];
  const newest = list[list.length - 1];
  const out = [newest];
  for (let k = 1; k < count; k += 1) {
    const target = newest.epoch - k * stepMs;
    let best = null;
    let bestDt = Infinity;
    for (const f of list) {
      const dt = Math.abs(f.epoch - target);
      if (dt < bestDt) {
        best = f;
        bestDt = dt;
      }
    }
    if (best && bestDt <= toleranceMs && best.epoch < out[0].epoch) out.unshift(best);
  }
  return out;
}

/**
 * Is MRMS fit to drive the mosaic right now?
 *
 * @param {Array<{epoch: Number}>} list files, oldest first
 * @param {Number} nowMs current time
 * @param {Number} [staleMs] newest-file age beyond which it is not
 * @returns {Boolean} true when the newest file is recent enough
 */
function mrmsUsable(list, nowMs, staleMs = MRMS_STALE_MS) {
  return Boolean(list && list.length) && nowMs - list[list.length - 1].epoch <= staleMs;
}

/**
 * Should the map draw MRMS (rather than fall back to IEM) right now?
 * The file LIST being fresh is not enough: what matters is whether there
 * is a decoded frame to paint. A frame that failed to load left MRMS
 * selected with nothing on screen until the next file (~2 min), and since
 * every new file reset the failure count, a run of bad frames never
 * reached the fallback at all (review finding, 2026-10-11).
 *
 * @param {object} s state
 * @param {Array<{epoch: Number}>|null} s.list MRMS files, oldest first
 * @param {Boolean} s.listFailed the last list request failed
 * @param {Number} s.frameFailures consecutive frame-load failures (reset only by a success)
 * @param {String|null} s.fieldValidTime valid time of the decoded frame on hand, if any
 * @param {Number} s.nowMs current time
 * @param {Number} [maxFailures] failures after which MRMS counts as down
 * @param {Number} [staleMs] age beyond which a file or frame is too old
 * @returns {Boolean} true to draw MRMS
 */
function mrmsReady({ list, listFailed, frameFailures, fieldValidTime, nowMs }, maxFailures = 2, staleMs = MRMS_STALE_MS) {
  if (listFailed || !mrmsUsable(list, nowMs, staleMs) || frameFailures >= maxFailures) return false;
  // No frame yet: MRMS only while the first one is still loading cleanly.
  if (!fieldValidTime) return frameFailures === 0;
  return nowMs - Date.parse(fieldValidTime) <= staleMs;
}

/**
 * Reflectivity of a decoded MRMS mosaic field at a point — the hover
 * readout. The field is the N0Q byte scale (dBZ = level / 2 − 32.5,
 * 0 = no echo) with cell-centre geometry, rows running south.
 *
 * @param {{grid: {ni: Number, nj: Number, lat0: Number, lon0: Number, dLat: Number, dLon: Number}, cells: Uint8Array}} field decoded field
 * @param {Number} lat latitude
 * @param {Number} lon longitude
 * @returns {Number|null} dBZ, or null outside the grid / no echo
 */
function reflDbzAt(field, lat, lon) {
  if (!field || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const { grid, cells } = field;
  const r = Math.round((grid.lat0 - lat) / grid.dLat);
  const c = Math.round((lon - grid.lon0) / grid.dLon);
  if (r < 0 || c < 0 || r >= grid.nj || c >= grid.ni) return null;
  const level = cells[r * grid.ni + c];
  return level ? level * 0.5 - 32.5 : null;
}
// ---------- end of verbatim copy ----------

const S = 1000;
const MIN = 60 * S;
const T0 = Date.UTC(2026, 9, 7, 13, 20, 0);
// MRMS files on 2026-10-07: ~2-minute cadence at irregular seconds.
const OFFSETS = [0, 117, 236, 355, 474, 593, 712, 831, 950, 1069, 1188, 1307, 1426, 1545, 1664, 1783,
  1902, 2021, 2140, 2259, 2378, 2497, 2616, 2735, 2854, 2973, 3092];
const LIST = OFFSETS.map((o, i) => ({ stamp: `f${i}`, epoch: T0 + o * S }));

test("eleven frames, newest last, each a real file nearest a 5-minute step", () => {
  const frames = pickMrmsFrames(LIST);
  assert.equal(frames.length, 11);
  assert.equal(frames[frames.length - 1].stamp, LIST[LIST.length - 1].stamp);
  const newest = LIST[LIST.length - 1].epoch;
  frames.slice(0, -1).reverse().forEach((f, i) => {
    assert.ok(Math.abs(f.epoch - (newest - (i + 1) * 5 * MIN)) <= MOSAIC_PICK_TOLERANCE_MS);
    assert.ok(LIST.includes(f), "a listed file, never an interpolated time");
  });
  for (let i = 1; i < frames.length; i += 1) assert.ok(frames[i].epoch > frames[i - 1].epoch);
});

test("a step with no file nearby is left out rather than filled with a neighbour", () => {
  const newest = LIST[LIST.length - 1].epoch;
  // Remove every file within 3 min of the −20-minute step.
  const gappy = LIST.filter((f) => Math.abs(f.epoch - (newest - 20 * MIN)) > 3 * MIN);
  const frames = pickMrmsFrames(gappy);
  assert.equal(frames.length, 10);
  assert.ok(frames.every((f) => Math.abs(f.epoch - (newest - 20 * MIN)) > MOSAIC_PICK_TOLERANCE_MS));
});

test("a short list gives as many frames as it can, with no duplicates", () => {
  const frames = pickMrmsFrames(LIST.slice(-4));
  assert.equal(new Set(frames.map((f) => f.stamp)).size, frames.length);
  assert.ok(frames.length >= 2 && frames.length <= 3);
  assert.deepEqual(pickMrmsFrames([]), []);
});

test("MRMS drives the mosaic only while its newest file is recent", () => {
  const newest = LIST[LIST.length - 1].epoch;
  assert.equal(mrmsUsable(LIST, newest + 3 * MIN), true);
  assert.equal(mrmsUsable(LIST, newest + MRMS_STALE_MS), true);
  assert.equal(mrmsUsable(LIST, newest + MRMS_STALE_MS + 1), false);
  assert.equal(mrmsUsable([], newest), false);
  assert.equal(mrmsUsable(null, newest), false);
});

test("hover readout: dBZ from the N0Q byte under a point, null for no echo or off the grid", () => {
  const field = {
    grid: { ni: 3, nj: 2, lat0: 30, lon0: -100, dLat: 0.01, dLon: 0.01 },
    cells: Uint8Array.from([0, 130, 95, 65, 255, 1]),
  };
  assert.equal(reflDbzAt(field, 30, -99.99), 32.5); // level 130
  assert.equal(reflDbzAt(field, 30.004, -99.98), 15); // level 95, inside the cell
  assert.equal(reflDbzAt(field, 29.99, -100), 0); // level 65 = 0 dBZ is an echo, not "none"
  assert.equal(reflDbzAt(field, 30, -100), null); // level 0
  assert.equal(reflDbzAt(field, 31, -100), null);
  assert.equal(reflDbzAt(null, 30, -100), null);
});

test("mrmsReady: a failed frame with nothing decoded falls back to IEM at once", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const list = [{ epoch: now - 2 * 60000 }];
  // Cold start, first frame still loading: MRMS (no flash of the fallback).
  assert.equal(mrmsReady({ list, listFailed: false, frameFailures: 0, fieldValidTime: null, nowMs: now }), true);
  // That frame failed: nothing to paint, so IEM — not a blank map.
  assert.equal(mrmsReady({ list, listFailed: false, frameFailures: 1, fieldValidTime: null, nowMs: now }), false);
  // A recent frame on hand survives one failure of the next.
  assert.equal(mrmsReady({ list, listFailed: false, frameFailures: 1, fieldValidTime: "2026-10-11T11:56:00Z", nowMs: now }), true);
  // A run of failures reaches the fallback even with a frame on hand.
  assert.equal(mrmsReady({ list, listFailed: false, frameFailures: 2, fieldValidTime: "2026-10-11T11:56:00Z", nowMs: now }), false);
  // A fresh list cannot keep an old frame on screen.
  assert.equal(mrmsReady({ list, listFailed: false, frameFailures: 1, fieldValidTime: "2026-10-11T11:45:00Z", nowMs: now }), false);
  // List failure or a stale list: IEM, as before.
  assert.equal(mrmsReady({ list, listFailed: true, frameFailures: 0, fieldValidTime: "2026-10-11T11:59:00Z", nowMs: now }), false);
  assert.equal(mrmsReady({ list: [{ epoch: now - 15 * 60000 }], listFailed: false, frameFailures: 0, fieldValidTime: null, nowMs: now }), false);
});
