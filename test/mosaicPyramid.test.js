// Max-downsampled reflectivity for zoomed-out views (maxPyramidLevel in
// client/src/components/WeatherMap/PrecipMosaicLayer.js): each reduced cell
// is the maximum of its block, and its geometry is the block's centre.
//
// The copy below is kept identical to the source by test/verbatimSync.test.js.
//
// Run: `npm test`

const { test } = require("node:test");
const assert = require("node:assert/strict");

// ---------- start of verbatim copy from client/src/components/WeatherMap/PrecipMosaicLayer.js ----------
const pyramids = new WeakMap();
// Deepest level: 16 × 16 source cells per sample (~16 km), enough for the
// whole-CONUS view.
const MAX_PYRAMID_LEVEL = 4;

/**
 * A copy of the field reduced 2^level times in each direction, each cell
 * the MAXIMUM of the block it covers.
 *
 * WHY: at low zoom one screen pixel spans many 1 km cells, and sampling
 * one of them (nearest neighbour) mostly lands between showers — zoomed out
 * to Texas a widespread light-rain area thinned to scattered specks
 * (2026-10-07). The maximum keeps every echo visible and every core at its
 * peak, which is how radar mosaics are conventionally zoomed out. Valid for
 * reflectivity only: its byte levels are monotonic in dBZ.
 *
 * @param {{grid: Object, cells: Uint8Array}} field decoded field (level 0)
 * @param {Number} level 1–MAX_PYRAMID_LEVEL
 * @returns {{grid: Object, cells: Uint8Array}} reduced field, cell-centre geometry
 */
function maxPyramidLevel(field, level) {
  let levels = pyramids.get(field.cells);
  if (!levels) {
    levels = [{ grid: field.grid, cells: field.cells }];
    pyramids.set(field.cells, levels);
  }
  for (let l = levels.length; l <= level; l += 1) {
    const { grid: g, cells: src } = levels[l - 1];
    const ni = Math.ceil(g.ni / 2);
    const nj = Math.ceil(g.nj / 2);
    const out = new Uint8Array(ni * nj);
    for (let J = 0; J < nj; J += 1) {
      const r0 = 2 * J * g.ni;
      const r1 = 2 * J + 1 < g.nj ? r0 + g.ni : r0;
      for (let I = 0; I < ni; I += 1) {
        const c0 = 2 * I;
        const c1 = c0 + 1 < g.ni ? c0 + 1 : c0;
        let m = src[r0 + c0];
        if (src[r0 + c1] > m) m = src[r0 + c1];
        if (src[r1 + c0] > m) m = src[r1 + c0];
        if (src[r1 + c1] > m) m = src[r1 + c1];
        out[J * ni + I] = m;
      }
    }
    levels.push({
      grid: { ni, nj, lat0: g.lat0 - g.dLat / 2, lon0: g.lon0 + g.dLon / 2, dLat: g.dLat * 2, dLon: g.dLon * 2 },
      cells: out,
    });
  }
  return levels[level];
}
// ---------- end of verbatim copy ----------

const GRID = { ni: 5, nj: 3, lat0: 50, lon0: -100, dLat: 0.01, dLon: 0.01 };
// 5 × 3, odd on both axes so the last block is partial.
const CELLS = Uint8Array.from([
  0, 0, 90, 0, 7,
  0, 120, 0, 0, 0,
  60, 0, 0, 200, 0,
]);

test("each reduced cell is the max of its 2×2 block, partial edge blocks included", () => {
  const l1 = maxPyramidLevel({ grid: GRID, cells: CELLS }, 1);
  assert.equal(l1.grid.ni, 3);
  assert.equal(l1.grid.nj, 2);
  assert.deepEqual([...l1.cells], [120, 90, 7, 60, 200, 0]);
});

test("reduced geometry is the block centre at twice the spacing", () => {
  const { grid } = maxPyramidLevel({ grid: GRID, cells: CELLS }, 1);
  assert.ok(Math.abs(grid.lat0 - 49.995) < 1e-9);
  assert.ok(Math.abs(grid.lon0 - -99.995) < 1e-9);
  assert.equal(grid.dLat, 0.02);
  assert.equal(grid.dLon, 0.02);
});

test("deeper levels build on the previous one and keep the peak; levels are cached per field", () => {
  const field = { grid: GRID, cells: CELLS };
  const l2 = maxPyramidLevel(field, 2);
  assert.equal(l2.grid.ni, 2);
  assert.equal(l2.grid.nj, 1);
  assert.deepEqual([...l2.cells], [200, 7]);
  assert.equal(maxPyramidLevel(field, 2), l2);
});
