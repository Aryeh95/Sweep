/* Colour-enhanced infrared: GOES-East channel 13 painted by cloud-top
 * temperature, on the scale Tropical Tidbits uses (gray → cyan at −20 °C →
 * navy → green → yellow → red → black at −70 °C → gray → pink/purple below
 * −80 °C). Pure functions only; the Leaflet layer is
 * components/WeatherMap/ColorIrLayer.js.
 *
 * WHY NOT RECOLOUR IEM'S TILES: the `goes_east_conus_ch13` tiles are
 * already colour-enhanced, but their table reuses gray levels — the
 * coldest tops (≤ −76 °C) are drawn in a gray ramp that repeats the warm-
 * ground grays exactly (gray 30 is both 295 K and 196 K), so colour →
 * temperature is ambiguous for precisely the pixels that matter most. The
 * layer instead draws 8-bit McIDAS brightness counts on the 2500 × 1500
 * GOES-R fixed grid, decoded by server/goesIrCtrl.js from NOAA's CMIP
 * files (the representation IEM's own source image uses: verified
 * 2026-10-07 over 1.23 M pixels, every pixel equal or one count apart).
 */

// Scale stops, warmest first: [°C, r, g, b], linear between stops.
// Sampled from the Tropical Tidbits colour bar at every degree; the two
// pairs 0.01 °C apart are its hard edges (white → cyan at −20 °C, light
// gray → pink at −80 °C).
export const IR_STOPS_C = [
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
export const IR_GRAY_STOPS_C = [
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
export function irCountToKelvin(count) {
  return count <= 176 ? (660 - count) / 2 : 418 - count;
}

/**
 * Colour for a cloud-top temperature on a stop scale.
 *
 * @param {Number} celsius temperature
 * @param {Array<Array<Number>>} [stops] scale, warmest first (default IR_STOPS_C)
 * @returns {Array<Number>} [r, g, b]
 */
export function colorForIrCelsius(celsius, stops = IR_STOPS_C) {
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
export function buildIrLut(stops = IR_STOPS_C) {
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
export function geosLatTerms(latDeg) {
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
export function geosProject(latTerms, cosDl, sinDl) {
  const sx = H - latTerms.rcCos * cosDl;
  const sy = -latTerms.rcCos * sinDl;
  const { sz } = latTerms;
  if (H * (H - sx) < sy * sy + EQ2_POL2 * sz * sz) return null;
  const x = Math.asin(-sy / Math.sqrt(sx * sx + sy * sy + sz * sz));
  const y = Math.atan(sz / sx);
  return [x * PERSPECTIVE_H, y * PERSPECTIVE_H];
}

/**
 * Brightness temperature of a decoded scan at a point — the hover readout.
 *
 * @param {{width: Number, height: Number, data: Uint8Array, x0: Number, y0: Number, dx: Number, dy: Number, lon0: Number}} grid decoded scan
 * @param {Number} lat latitude
 * @param {Number} lon longitude
 * @returns {Number|null} kelvin, or null off the scan / on a no-data count
 */
export function irKelvinAt(grid, lat, lon) {
  if (!grid || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const dl = (lon - grid.lon0) * DEG;
  const p = geosProject(geosLatTerms(lat), Math.cos(dl), Math.sin(dl));
  if (!p) return null;
  const col = Math.round((p[0] - grid.x0) / grid.dx);
  const row = Math.round((grid.y0 - p[1]) / grid.dy);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null;
  const count = grid.data[row * grid.width + col];
  return count === 0 || count === 255 ? null : irCountToKelvin(count);
}
