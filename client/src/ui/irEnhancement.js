/* Colour-enhanced infrared: GOES-East channel 13 painted by cloud-top
 * temperature, on the scale Tropical Tidbits uses (gray → cyan at −20 °C →
 * navy → green → yellow → red → black at −70 °C → gray → pink/purple below
 * −80 °C). Pure functions only; the Leaflet layer is
 * components/WeatherMap/ColorIrLayer.js.
 *
 * WHY NOT RECOLOUR IEM'S TILES: the `goes_east_conus_ch13` tiles are
 * already colour-enhanced, but their table reuses gray levels — the
 * coldest tops (≤ −76 °C) are drawn in a gray ramp that repeats the warm-
 * ground grays exactly (gray 30 is both 295 K and 196 K), so colour → temperature is
 * ambiguous for precisely the pixels that matter most. The layer instead
 * decodes IEM's source image, `GOES-19_C13.png`: an 8-bit paletted PNG
 * whose INDEX is the McIDAS brightness count, on the same 2500 × 1500
 * fixed grid as NOAA's CMIP product. Verified 2026-10-07 against the
 * matching `OR_ABI-L2-CMIPC-M6C13` file over 1.23 M pixels: every index is
 * within one count of the McIDAS count of the true brightness temperature
 * (IEM truncates), i.e. ±0.5 K warm of 242 K and ±1 K colder.
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
 * Colour for a cloud-top temperature on the IR_STOPS_C scale.
 *
 * @param {Number} celsius temperature
 * @returns {Array<Number>} [r, g, b]
 */
export function colorForIrCelsius(celsius) {
  if (celsius >= IR_STOPS_C[0][0]) return IR_STOPS_C[0].slice(1);
  for (let i = 1; i < IR_STOPS_C.length; i += 1) {
    const [t1, r1, g1, b1] = IR_STOPS_C[i];
    if (celsius >= t1) {
      const [t0, r0, g0, b0] = IR_STOPS_C[i - 1];
      const f = (t0 - celsius) / (t0 - t1);
      return [
        Math.round(r0 + (r1 - r0) * f),
        Math.round(g0 + (g1 - g0) * f),
        Math.round(b0 + (b1 - b0) * f),
      ];
    }
  }
  return IR_STOPS_C[IR_STOPS_C.length - 1].slice(1);
}

/**
 * RGBA lookup table indexed by brightness count. Counts 0 and 255 are
 * transparent: IEM's CONUS sector never uses them (measured range 57–233),
 * so they can only mean "no data".
 *
 * @returns {Uint8ClampedArray} 256 × 4 bytes
 */
export function buildIrLut() {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let c = 1; c < 255; c += 1) {
    const [r, g, b] = colorForIrCelsius(irCountToKelvin(c) - 273.15);
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
 * Parse an ESRI world file (six lines: dx, rot, rot, −dy, x, y of the
 * upper-left pixel CENTRE).
 *
 * @param {String} text world file contents
 * @returns {{dx: Number, dy: Number, x0: Number, y0: Number}|null} null when malformed
 */
export function parseWorldFile(text) {
  const v = String(text || "").trim().split(/\s+/).map(Number);
  if (v.length < 6 || v.some((n) => !Number.isFinite(n)) || v[0] <= 0 || v[3] >= 0) return null;
  return { dx: v[0], dy: -v[3], x0: v[4], y0: v[5] };
}

/**
 * Decode an 8-bit paletted (colour type 3) or 8-bit grayscale PNG to its
 * raw sample values — the palette is ignored on purpose: the index IS the
 * data.
 *
 * @param {Uint8Array} bytes PNG file
 * @param {(z: Uint8Array) => Uint8Array} inflate zlib inflate
 * @returns {{width: Number, height: Number, data: Uint8Array}} the samples, row-major
 */
export function decodeIndexedPng(bytes, inflate) {
  const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || SIG.some((b, i) => bytes[i] !== b)) throw new Error("not a PNG");
  let off = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  let idatLen = 0;
  while (off + 8 <= bytes.length) {
    const len = u32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const body = off + 8;
    if (type === "IHDR") {
      width = u32(body);
      height = u32(body + 4);
      const depth = bytes[body + 8];
      const colorType = bytes[body + 9];
      const interlace = bytes[body + 12];
      if (depth !== 8 || (colorType !== 3 && colorType !== 0) || interlace !== 0) {
        throw new Error(`unsupported PNG: depth ${depth}, colour type ${colorType}, interlace ${interlace}`);
      }
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(body, body + len));
      idatLen += len;
    } else if (type === "IEND") {
      break;
    }
    off = body + len + 4;
  }
  if (!width || !height || !idat.length) throw new Error("PNG has no image data");
  const z = new Uint8Array(idatLen);
  let p = 0;
  for (const part of idat) {
    z.set(part, p);
    p += part.length;
  }
  const raw = inflate(z);
  const stride = width;
  if (raw.length < (stride + 1) * height) throw new Error("PNG image data truncated");
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x > 0 ? out[dst + x - 1] : 0;
      const b = y > 0 ? out[dst - stride + x] : 0;
      const c = x > 0 && y > 0 ? out[dst - stride + x - 1] : 0;
      let v = raw[src + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      out[dst + x] = v & 255;
    }
  }
  return { width, height, data: out };
}
