// Colour-enhanced infrared (client/src/ui/irEnhancement.js): the brightness
// count decoding, the Tropical Tidbits-style colour scale, the GOES-R fixed-
// grid projection and the paletted-PNG decoder the layer reads IEM's raw
// channel-13 scan with.
//
// The copy below is kept identical to the source by test/verbatimSync.test.js.
//
// Run: `npm test`

const { test } = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

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
 * Colour for a cloud-top temperature on the IR_STOPS_C scale.
 *
 * @param {Number} celsius temperature
 * @returns {Array<Number>} [r, g, b]
 */
function colorForIrCelsius(celsius) {
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
function buildIrLut() {
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

/**
 * Parse an ESRI world file (six lines: dx, rot, rot, −dy, x, y of the
 * upper-left pixel CENTRE).
 *
 * @param {String} text world file contents
 * @returns {{dx: Number, dy: Number, x0: Number, y0: Number}|null} null when malformed
 */
function parseWorldFile(text) {
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
function decodeIndexedPng(bytes, inflate) {
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
  for (let i = 1; i < IR_STOPS_C.length; i += 1) assert.ok(IR_STOPS_C[i][0] < IR_STOPS_C[i - 1][0]);
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

test("world file: IEM's channel-13 file parses; malformed is null", () => {
  const wf = parseWorldFile("2004.017288\n0\n0\n-2004.017288\n-3626269.2826360003\n4588197.580875999\n");
  assert.deepEqual(wf, { dx: 2004.017288, dy: 2004.017288, x0: -3626269.2826360003, y0: 4588197.580875999 });
  assert.equal(parseWorldFile("1\n0\n0"), null);
  assert.equal(parseWorldFile("abc\n0\n0\n-1\n0\n0"), null);
  assert.equal(parseWorldFile(""), null);
});

/**
 * Build an 8-bit PNG of the given colour type from rows, each row written
 * with the filter type named in `filters` (encoded here, so the decoder's
 * unfiltering is checked against an independent implementation).
 */
function makePng(width, rows, filters, colorType = 3) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])) >>> 0);
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(rows.length, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const raw = [];
  rows.forEach((row, y) => {
    const prev = y > 0 ? rows[y - 1] : new Array(width).fill(0);
    const f = filters[y];
    raw.push(f);
    row.forEach((v, x) => {
      const a = x > 0 ? row[x - 1] : 0;
      const b = prev[x];
      const c = x > 0 ? prev[x - 1] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      }
      raw.push((v - p) & 255);
    });
  });
  const z = zlib.deflateSync(Buffer.from(raw));
  // Split IDAT in two to exercise multi-chunk assembly.
  const half = z.length >> 1;
  return new Uint8Array(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("PLTE", Buffer.alloc(768)),
    chunk("IDAT", z.subarray(0, half)),
    chunk("IDAT", z.subarray(half)),
    chunk("IEND", Buffer.alloc(0)),
  ]));
}

test("PNG decoder returns the raw indices through all five filter types", () => {
  const rows = [
    [10, 200, 30, 255, 0, 77],
    [11, 190, 35, 250, 3, 70],
    [59, 233, 176, 177, 120, 140],
    [1, 2, 3, 4, 5, 6],
    [254, 128, 64, 32, 16, 8],
  ];
  const png = makePng(6, rows, [0, 1, 2, 3, 4]);
  const out = decodeIndexedPng(png, (z) => zlib.inflateSync(z));
  assert.equal(out.width, 6);
  assert.equal(out.height, 5);
  assert.deepEqual([...out.data], rows.flat());
});

test("PNG decoder refuses what it cannot read rather than misdecoding it", () => {
  assert.throws(() => decodeIndexedPng(new Uint8Array(40), zlib.inflateSync), /not a PNG/);
  const rgb = makePng(2, [[1, 2]], [0], 2);
  assert.throws(() => decodeIndexedPng(rgb, (z) => zlib.inflateSync(z)), /unsupported PNG/);
});
