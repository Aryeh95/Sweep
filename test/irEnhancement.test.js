// Colour-enhanced infrared (client/src/ui/irEnhancement.js): the brightness
// count decoding, the Tropical Tidbits-style colour scale and the GOES-R
// fixed-grid projection.
//
// The copy below is kept identical to the source by test/verbatimSync.test.js.
//
// Run: `npm test`

const { test } = require("node:test");
const assert = require("node:assert/strict");

// ---------- start of verbatim copy from client/src/ui/irEnhancement.js ----------
// Scale stops, warmest first: [°C, r, g, b], linear between stops.
// Sampled from the Tropical Tidbits colour bar at every degree; the two
// pairs 0.01 °C apart are its hard edges (white → cyan at −20 °C, light
// gray → pink at −80 °C).
const IR_STOPS_C = [
  [40, 10, 10, 10],
  [20, 112, 112, 112],
  [0, 206, 206, 206],
  [-19.99, 255, 255, 255],
  [-20, 0, 250, 250],
  [-25, 0, 150, 195],
  [-30, 0, 0, 114],
  [-35, 2, 104, 74],
  [-40, 0, 252, 0],
  [-45, 97, 255, 0],
  [-50, 250, 255, 0],
  [-55, 252, 150, 0],
  [-60, 250, 0, 0],
  [-65, 154, 0, 0],
  [-70, 6, 0, 0],
  [-74, 92, 92, 92],
  [-79.99, 235, 235, 235],
  [-80, 235, 114, 189],
  [-90, 126, 0, 124],
];

// Plain infrared: warm surfaces dark, the coldest tops white, linear in
// between — the conventional gray IR picture, drawn through the same
// layer so both infrared modes animate.
const IR_GRAY_STOPS_C = [
  [40, 20, 20, 20],
  [-80, 255, 255, 255],
];

/**
 * McIDAS brightness count → brightness temperature.
 * Counts ≤ 176 step 0.5 K (T = (660 − B) / 2, i.e. ≥ 242 K); colder
 * counts step 1 K (T = 418 − B).
 *
 * @param {Number} count 0–255
 * @returns {Number} kelvin
 */
function irCountToKelvin(count) {
  return count <= 176 ? (660 - count) / 2 : 418 - count;
}

/**
 * Colour for a cloud-top temperature on a stop scale.
 *
 * @param {Number} celsius temperature
 * @param {Array<Array<Number>>} [stops] scale, warmest first (default IR_STOPS_C)
 * @returns {Array<Number>} [r, g, b]
 */
function colorForIrCelsius(celsius, stops = IR_STOPS_C) {
  if (celsius >= stops[0][0]) return stops[0].slice(1);
  for (let i = 1; i < stops.length; i += 1) {
    const [t1, r1, g1, b1] = stops[i];
    if (celsius >= t1) {
      const [t0, r0, g0, b0] = stops[i - 1];
      const f = (t0 - celsius) / (t0 - t1);
      return [
        Math.round(r0 + (r1 - r0) * f),
        Math.round(g0 + (g1 - g0) * f),
        Math.round(b0 + (b1 - b0) * f),
      ];
    }
  }
  return stops[stops.length - 1].slice(1);
}

/**
 * RGBA lookup table indexed by brightness count. Counts 0 and 255 are
 * transparent: IEM's CONUS sector never uses them (measured range 57–233),
 * so they can only mean "no data".
 *
 * @param {Array<Array<Number>>} [stops] scale, warmest first (default IR_STOPS_C)
 * @returns {Uint8ClampedArray} 256 × 4 bytes
 */
function buildIrLut(stops = IR_STOPS_C) {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let c = 1; c < 255; c += 1) {
    const [r, g, b] = colorForIrCelsius(irCountToKelvin(c) - 273.15, stops);
    lut[c * 4] = r;
    lut[c * 4 + 1] = g;
    lut[c * 4 + 2] = b;
    lut[c * 4 + 3] = 255;
  }
  return lut;
}

// GOES-R fixed grid (GOES-R PUG vol. 3 §4.2.8), GRS80 ellipsoid.
const R_EQ = 6378137;
const R_POL = 6356752.31414;
const PERSPECTIVE_H = 35786023;
const H = PERSPECTIVE_H + R_EQ;
const E2 = 0.0066943800699785;
const POL2_EQ2 = (R_POL * R_POL) / (R_EQ * R_EQ);
const EQ2_POL2 = (R_EQ * R_EQ) / (R_POL * R_POL);
const DEG = Math.PI / 180;

/**
 * Per-latitude terms of the fixed-grid projection, hoisted so a tile row
 * computes them once.
 *
 * @param {Number} latDeg geodetic latitude
 * @returns {{rcCos: Number, sz: Number}} rc·cos φc and rc·sin φc
 */
function geosLatTerms(latDeg) {
  const phiC = Math.atan(POL2_EQ2 * Math.tan(latDeg * DEG));
  const cosC = Math.cos(phiC);
  const rc = R_POL / Math.sqrt(1 - E2 * cosC * cosC);
  return { rcCos: rc * cosC, sz: rc * Math.sin(phiC) };
}

/**
 * Projected fixed-grid coordinates (proj4 `+proj=geos +sweep=x` metres,
 * the units of IEM's world file) for one point, or null when the point is
 * on the far side of the Earth from the satellite.
 *
 * @param {{rcCos: Number, sz: Number}} latTerms geosLatTerms(lat)
 * @param {Number} cosDl cos(lon − lon0)
 * @param {Number} sinDl sin(lon − lon0)
 * @returns {Array<Number>|null} [x, y] metres
 */
function geosProject(latTerms, cosDl, sinDl) {
  const sx = H - latTerms.rcCos * cosDl;
  const sy = -latTerms.rcCos * sinDl;
  const { sz } = latTerms;
  if (H * (H - sx) < sy * sy + EQ2_POL2 * sz * sz) return null;
  const x = Math.asin(-sy / Math.sqrt(sx * sx + sy * sy + sz * sz));
  const y = Math.atan(sz / sx);
  return [x * PERSPECTIVE_H, y * PERSPECTIVE_H];
}
// ---------- end of verbatim copy ----------

test("brightness counts: 0.5 K steps down to 242 K, 1 K steps colder (McIDAS)", () => {
  assert.equal(irCountToKelvin(0), 330);
  assert.equal(irCountToKelvin(59), 300.5); // warmest pixel in the 2026-10-07 scan: Gulf water
  assert.equal(irCountToKelvin(176), 242);
  assert.equal(irCountToKelvin(177), 241);
  assert.equal(irCountToKelvin(233), 185); // coldest pixel that morning: −88 °C tops
});

test("colour scale: gray above −20 °C, then the Tropical Tidbits bands", () => {
  const [r, g, b] = colorForIrCelsius(10);
  assert.ok(r === g && g === b, "warm cloud and ground are gray");
  assert.deepEqual(colorForIrCelsius(-19.99), [255, 255, 255]);
  assert.deepEqual(colorForIrCelsius(-20), [0, 250, 250]); // hard edge to cyan
  assert.deepEqual(colorForIrCelsius(-30), [0, 0, 114]); // navy
  assert.deepEqual(colorForIrCelsius(-40), [0, 252, 0]); // green
  assert.deepEqual(colorForIrCelsius(-50), [250, 255, 0]); // yellow
  assert.deepEqual(colorForIrCelsius(-60), [250, 0, 0]); // red
  assert.deepEqual(colorForIrCelsius(-70), [6, 0, 0]); // black
  assert.deepEqual(colorForIrCelsius(-79.99), [235, 235, 235]);
  assert.deepEqual(colorForIrCelsius(-80), [235, 114, 189]); // hard edge to pink
  assert.deepEqual(colorForIrCelsius(-120), [126, 0, 124]); // clamps cold
  assert.deepEqual(colorForIrCelsius(60), [10, 10, 10]); // clamps warm
});

test("colour scale stops run strictly warm to cold", () => {
  for (const stops of [IR_STOPS_C, IR_GRAY_STOPS_C]) {
    for (let i = 1; i < stops.length; i += 1) assert.ok(stops[i][0] < stops[i - 1][0]);
  }
});

test("gray scale: dark when warm, white when coldest, gray in between", () => {
  assert.deepEqual(colorForIrCelsius(30, IR_GRAY_STOPS_C), [40, 40, 40]);
  assert.deepEqual(colorForIrCelsius(-80, IR_GRAY_STOPS_C), [255, 255, 255]);
  const [r, g, b] = colorForIrCelsius(-50, IR_GRAY_STOPS_C);
  assert.ok(r === g && g === b && r > 40 && r < 255);
  const lut = buildIrLut(IR_GRAY_STOPS_C);
  assert.equal(lut[3], 0);
  assert.deepEqual([...lut.subarray(233 * 4, 233 * 4 + 4)], [255, 255, 255, 255]);
});

test("LUT: counts 0 and 255 are transparent, every other count is opaque", () => {
  const lut = buildIrLut();
  assert.equal(lut[3], 0);
  assert.equal(lut[255 * 4 + 3], 0);
  for (let c = 1; c < 255; c += 1) assert.equal(lut[c * 4 + 3], 255);
  // count 200 = 218 K = −55.15 °C → orange
  assert.deepEqual([...lut.subarray(200 * 4, 200 * 4 + 3)], colorForIrCelsius(218 - 273.15));
});

test("fixed-grid projection matches the GOES-R PUG worked example", () => {
  // PUG vol. 3 §5.1.2.8: 33.846162 N, 84.690932 W → x −0.024052, y 0.095340 rad.
  const dl = (-84.690932 + 75) * DEG;
  const [x, y] = geosProject(geosLatTerms(33.846162), Math.cos(dl), Math.sin(dl));
  assert.ok(Math.abs(x / PERSPECTIVE_H - -0.024052) < 1e-6, `x ${x / PERSPECTIVE_H}`);
  assert.ok(Math.abs(y / PERSPECTIVE_H - 0.095340) < 1e-6, `y ${y / PERSPECTIVE_H}`);
});

test("fixed-grid projection: sub-satellite point is the origin, the far side is null", () => {
  const [x, y] = geosProject(geosLatTerms(0), 1, 0);
  assert.ok(Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6);
  const far = 105 * DEG; // 180° from −75°
  assert.equal(geosProject(geosLatTerms(0), Math.cos(far), Math.sin(far)), null);
});
