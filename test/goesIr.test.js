// GOES-East infrared history (server/goesIrCtrl.js): bucket key parsing,
// the Kelvin → brightness-count conversion the client's lookup table
// expects, and an end-to-end decode of a small synthetic CMIP file built
// with h5wasm (a real one is 3.8 MB — too big to commit as a fixture; the
// live decode was checked against IEM's image of the same scan, see the
// controller's header).
//
// Run: `npm test`

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  keyEpoch, stampOf, hourPrefix, kelvinToCount, countsFromCmi, decodeCmipBuffer,
} = require("../server/goesIrCtrl");

test("bucket keys: scan START time, any scan mode, channel 13 only", () => {
  const key = "ABI-L2-CMIPC/2026/280/13/OR_ABI-L2-CMIPC-M6C13_G19_s20262801301178_e20262801303562_c20262801304046.nc";
  assert.equal(new Date(keyEpoch(key)).toISOString(), "2026-10-07T13:01:17.000Z");
  assert.equal(stampOf(keyEpoch(key)), "202610071301");
  assert.notEqual(keyEpoch(key.replace("M6C13", "M3C13")), null);
  assert.equal(keyEpoch(key.replace("C13", "C02")), null);
  assert.equal(keyEpoch(key.replace("_G19_", "_G16_")), null);
  assert.equal(keyEpoch("garbage"), null);
});

test("hour prefixes follow the bucket's day-of-year layout", () => {
  assert.equal(hourPrefix(Date.UTC(2026, 9, 7, 13, 59)), "ABI-L2-CMIPC/2026/280/13/");
  assert.equal(hourPrefix(Date.UTC(2026, 0, 1, 0, 0)), "ABI-L2-CMIPC/2026/001/00/");
});

test("Kelvin → McIDAS count: the inverse of the client's decoding, clamped to 1–254", () => {
  // client: count ≤ 176 → (660 − B) / 2, else 418 − B
  assert.equal(kelvinToCount(300.5), 59);
  assert.equal(kelvinToCount(242), 176);
  assert.equal(kelvinToCount(241), 177);
  assert.equal(kelvinToCount(185), 233);
  assert.equal(kelvinToCount(400), 1); // never 0: 0 means "no data"
  assert.equal(kelvinToCount(100), 254);
  for (let c = 1; c < 255; c += 1) {
    const k = c <= 176 ? (660 - c) / 2 : 418 - c;
    assert.equal(kelvinToCount(k), c);
  }
});

test("fill samples become count 0 (drawn transparent)", () => {
  const counts = countsFromCmi(new Int16Array([-1, 2000, -1]), 0.06145332, 89.62, -1);
  assert.deepEqual([...counts], [0, kelvinToCount(2000 * 0.06145332 + 89.62), 0]);
});

test("a CMIP file decodes to counts plus IEM-style fixed-grid geometry", async () => {
  const h5 = await import("h5wasm/node");
  const { FS } = await h5.ready;
  const name = `syn-${process.pid}.nc`;
  const f = new h5.File(name, "w");
  const cmi = f.create_dataset({ name: "CMI", data: new Int16Array([0, 100, -1, 2000, 3000, 4095]), shape: [2, 3], dtype: "<h" });
  cmi.create_attribute("scale_factor", new Float32Array([0.06145332]));
  cmi.create_attribute("add_offset", new Float32Array([89.62]));
  cmi.create_attribute("_FillValue", new Int16Array([-1]));
  const x = f.create_dataset({ name: "x", data: new Int16Array([0, 1, 2]), dtype: "<h" });
  x.create_attribute("scale_factor", new Float32Array([0.000056]));
  x.create_attribute("add_offset", new Float32Array([-0.101332]));
  const y = f.create_dataset({ name: "y", data: new Int16Array([0, 1]), dtype: "<h" });
  y.create_attribute("scale_factor", new Float32Array([-0.000056]));
  y.create_attribute("add_offset", new Float32Array([0.128212]));
  const p = f.create_dataset({ name: "goes_imager_projection", data: new Int32Array([0]), dtype: "<i" });
  p.create_attribute("perspective_point_height", new Float64Array([35786023]));
  p.create_attribute("longitude_of_projection_origin", new Float64Array([-75]));
  f.close();
  const bytes = FS.readFile(name);
  FS.unlink(name);

  const frame = await decodeCmipBuffer(bytes);
  assert.equal(frame.width, 3);
  assert.equal(frame.height, 2);
  assert.equal(frame.lon0, -75);
  // Upper-left pixel centre in geos metres: radians × perspective height
  // (IEM's world file: x0 −3 626 269, y0 4 588 197, dx 2004.017).
  assert.ok(Math.abs(frame.x0 - -0.101332 * 35786023) < 2);
  assert.ok(Math.abs(frame.y0 - 0.128212 * 35786023) < 2);
  assert.ok(Math.abs(frame.dx - 0.000056 * 35786023) < 0.01);
  assert.ok(Math.abs(frame.dy - 0.000056 * 35786023) < 0.01);
  const k = (r) => kelvinToCount(r * Math.fround(0.06145332) + Math.fround(89.62));
  assert.deepEqual([...frame.counts], [k(0), k(100), 0, k(2000), k(3000), k(4095)]);
});
