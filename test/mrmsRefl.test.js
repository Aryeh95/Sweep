// MRMS reflectivity mosaic (server/mrmsReflCtrl.js): the dBZ → N0Q-byte
// re-encoding the client's palette LUT expects, the grid geometry, and the
// stamp format the timeline and the frame route share.
//
// Run: `npm test`

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildCells, stampOf, stampEpoch, SCALING } = require("../server/mrmsReflCtrl");

// The packing MRMS used for ReflectivityAtLowestAltitude on 2026-10-07:
// value = (ref + sample × 2^binScale) / 10^decScale = (−9990 + s) / 10.
const G = { ni: 4, nj: 2, lat0: 54.995, lon0: 230.005, dLat: 0.01, dLon: 0.01, ref: -9990, binScale: 0, decScale: 1 };
const sampleFor = (dbz) => Math.round(dbz * 10 + 9990);

test("dBZ values land on the N0Q byte scale; missing codes and no-echo stay empty", () => {
  const dbz = [-999, -99, -10, 0, 15, 35.5, 57, 75];
  const { cells, drawn, maxDbz } = buildCells({ g: G, samples: Uint16Array.from(dbz.map(sampleFor)) });
  const level = (d) => Math.round((d - SCALING.min) / SCALING.increment);
  assert.deepEqual([...cells], [0, 0, level(-10), level(0), level(15), level(35.5), level(57), level(75)]);
  assert.equal(drawn, 6);
  assert.equal(maxDbz, 75);
  // Decoding with the client's scaling gives the dBZ back.
  assert.equal(cells[4] * SCALING.increment + SCALING.min, 15);
});

test("grid geometry: cell centres, longitude folded to ±180", () => {
  const { grid } = buildCells({ g: G, samples: new Uint16Array(8) });
  assert.deepEqual(grid, { ni: 4, nj: 2, lat0: 54.995, lon0: -129.995, dLat: 0.01, dLon: 0.01 });
});

test("stamps: 14 digits from the file time, parsed back exactly; 12 digits mean :00", () => {
  assert.equal(stampOf("2026-10-07T14:10:36.000Z"), "20261007141036");
  assert.equal(new Date(stampEpoch("20261007141036")).toISOString(), "2026-10-07T14:10:36.000Z");
  assert.equal(new Date(stampEpoch("202610071410")).toISOString(), "2026-10-07T14:10:00.000Z");
  assert.ok(Number.isNaN(stampEpoch("2026")));
  assert.ok(Number.isNaN(stampEpoch("x")));
});
