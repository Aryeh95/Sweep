// GOES-East infrared history for the satellite loop.
//
// The live satellite frame comes straight from IEM (its `GOES-19_C13.png`
// holds only the newest scan, and IEM's WMS and tile layers have no time
// dimension; its archive keeps only 4 km / 15-minute GeoTIFFs). History
// therefore comes from NOAA's own bucket, the source IEM's image is made
// from: `noaa-goes19/ABI-L2-CMIPC/YYYY/DDD/HH/OR_ABI-L2-CMIPC-M6C13_G19_s…nc`,
// one ~3.8 MB NetCDF-4 per 5-minute CONUS scan, keyless, CORS `*`.
//
// Each frame is decoded with h5wasm (as the GLM lightning files are) and
// reduced to the SAME representation the client already draws the live
// frame from: 8-bit McIDAS brightness counts on the 2500 × 1500 fixed grid
// (T ≥ 242 K: B = 660 − 2T; colder: B = 418 − T). Verified 2026-10-07
// against IEM's image of the same scan: every pixel equal or one count
// apart (IEM truncates, this rounds), and the grid origin identical to
// IEM's world file to the millimetre. Fill (−1) is space beyond the limb
// in the north-west corner (47 162 pixels, all off-disk) and becomes
// count 0, which the client draws transparent.
//
// The counts go out zlib-deflated and base64'd in JSON (~2.6 MB per frame,
// the same convention as the radial payloads), cached per scan — a scan
// never changes once published.

const axios = require("axios");
const zlib = require("zlib");
const { recordServiceCall } = require("./serviceStatus");
const { increment } = require("./requestCounter");

const SERVICE_NAME = "NOAA GOES-East (satellite loop)";
const BUCKET_BASE = "https://noaa-goes19.s3.amazonaws.com";
const PREFIX = "ABI-L2-CMIPC";
// Any scan mode (M6 normally, M3/M4 in special operations), channel 13,
// GOES-19. When GOES-East changes satellite, this and IR_IMAGE_BASE in
// client/src/ui/satellite.js move together.
const KEY_RE = /OR_ABI-L2-CMIPC-M\dC13_G19_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d/;
const API_TIMEOUT_MS = 30000;
const LIST_TTL_MS = 60 * 1000;
const MAX_MINUTES = 180;
const DEFAULT_MINUTES = 60;
// Cached encoded frames: ~2.6 MB each. Enough for a full loop (the client
// asks for at most 12) plus a scrub or two.
const FRAME_CACHE_MAX = 16;

const listCache = new Map(); // hour prefix → { keys, expires }
const frameCache = new Map(); // stamp → payload (insertion order = LRU)
const inflight = new Map(); // stamp → Promise

// h5wasm loads once (WASM init is not free); the promise is shared.
let h5wasmReady = null;
function getH5() {
  if (!h5wasmReady) {
    h5wasmReady = import("h5wasm/node").then(async (mod) => {
      await mod.ready;
      return mod;
    });
  }
  return h5wasmReady;
}

/**
 * Scan START time of a bucket key (sYYYYDDDHHMMSSt), epoch ms.
 *
 * @param {String} key bucket object key
 * @returns {Number|null} epoch ms, or null when the key does not match
 */
function keyEpoch(key) {
  const m = KEY_RE.exec(key || "");
  if (!m) return null;
  const [, y, doy, hh, mm, ss] = m;
  return Date.UTC(Number(y), 0, 1)
    + ((Number(doy) - 1) * 86400 + Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000;
}

/**
 * UTC YYYYMMDDHHMM for an epoch — the stamp a frame is requested by.
 *
 * @param {Number} epoch ms
 * @returns {String} stamp
 */
function stampOf(epoch) {
  return new Date(epoch).toISOString().slice(0, 16).replace(/[-:T]/g, "");
}

/**
 * Hour prefix in the bucket layout for an epoch.
 *
 * @param {Number} epoch ms
 * @returns {String} e.g. "ABI-L2-CMIPC/2026/280/13/"
 */
function hourPrefix(epoch) {
  const t = new Date(epoch);
  const doy = Math.floor((epoch - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  return `${PREFIX}/${t.getUTCFullYear()}/${String(doy).padStart(3, "0")}/${String(t.getUTCHours()).padStart(2, "0")}/`;
}

/**
 * Channel-13 keys under one hour prefix, cached for a minute (an older
 * hour cannot change, but one minute is cheap and keeps this simple).
 *
 * @param {String} prefix hour prefix
 * @returns {Promise<Array<String>>} keys
 */
async function listHour(prefix) {
  const hit = listCache.get(prefix);
  if (hit && hit.expires > Date.now()) return hit.keys;
  const res = await axios.get(BUCKET_BASE, {
    params: { "list-type": 2, prefix: `${prefix}OR_ABI-L2-CMIPC-M`, "max-keys": 1000 },
    timeout: API_TIMEOUT_MS,
    responseType: "text",
  });
  increment("goes", "list");
  const keys = (String(res.data).match(/<Key>[^<]+<\/Key>/g) || [])
    .map((m) => m.replace(/<\/?Key>/g, ""))
    .filter((k) => KEY_RE.test(k));
  listCache.set(prefix, { keys, expires: Date.now() + LIST_TTL_MS });
  if (listCache.size > 8) listCache.delete(listCache.keys().next().value);
  return keys;
}

/**
 * Every channel-13 scan whose start time falls in [fromMs, toMs], oldest
 * first.
 *
 * @param {Number} fromMs window start
 * @param {Number} toMs window end
 * @returns {Promise<Array<{key: String, epoch: Number, stamp: String}>>} scans
 */
async function listScans(fromMs, toMs) {
  const prefixes = [];
  for (let t = fromMs - (fromMs % 3600000); t <= toMs; t += 3600000) prefixes.push(hourPrefix(t));
  const out = [];
  for (const prefix of prefixes) {
    for (const key of await listHour(prefix)) {
      const epoch = keyEpoch(key);
      if (epoch != null && epoch >= fromMs && epoch <= toMs) out.push({ key, epoch, stamp: stampOf(epoch) });
    }
  }
  return out.sort((a, b) => a.epoch - b.epoch);
}

/**
 * Kelvin → McIDAS brightness count, clamped to 1–254 so 0 stays free for
 * "no data" (and 255 unused), matching the client's lookup table.
 *
 * @param {Number} kelvin brightness temperature
 * @returns {Number} count 1–254
 */
function kelvinToCount(kelvin) {
  const c = kelvin >= 242 ? Math.round(660 - 2 * kelvin) : Math.round(418 - kelvin);
  return c < 1 ? 1 : (c > 254 ? 254 : c);
}

/**
 * Packed CMI samples → counts (0 where the sample is fill).
 *
 * @param {ArrayLike<Number>} raw packed int16 samples
 * @param {Number} scale scale_factor
 * @param {Number} offset add_offset
 * @param {Number} fill _FillValue
 * @returns {Uint8Array} counts
 */
function countsFromCmi(raw, scale, offset, fill) {
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    const r = raw[i];
    if (r !== fill) out[i] = kelvinToCount(r * scale + offset);
  }
  return out;
}

/**
 * First element of an h5wasm attribute value (scalars arrive as 1-element
 * arrays).
 *
 * @param {Object} ds h5wasm dataset or group
 * @param {String} name attribute name
 * @returns {*} the value, or undefined when absent
 */
function attr(ds, name) {
  const a = ds && ds.attrs ? ds.attrs[name] : undefined;
  if (!a) return undefined;
  const v = a.value;
  return v != null && typeof v === "object" && "length" in v && typeof v !== "string" ? v[0] : v;
}

/**
 * Decode one CMIP channel-13 file into counts and grid geometry (proj4
 * `geos` metres, upper-left pixel CENTRE — the same numbers IEM's world
 * file carries).
 *
 * @param {Uint8Array} data NetCDF-4 file bytes
 * @returns {Promise<{width: Number, height: Number, x0: Number, y0: Number, dx: Number, dy: Number, lon0: Number, counts: Uint8Array}>} decoded frame
 */
async function decodeCmipBuffer(data) {
  const h5 = await getH5();
  const { FS } = await h5.ready;
  const scratch = `cmip-${Math.random().toString(36).slice(2)}.nc`;
  FS.writeFile(scratch, data);
  try {
    const f = new h5.File(scratch, "r");
    try {
      const cmi = f.get("CMI");
      const xd = f.get("x");
      const yd = f.get("y");
      const proj = f.get("goes_imager_projection");
      if (!cmi || !xd || !yd || !proj) throw new Error("not a CMIP file");
      const [height, width] = cmi.shape;
      const hp = attr(proj, "perspective_point_height");
      const x = xd.value;
      const y = yd.value;
      const xs = attr(xd, "scale_factor");
      const xo = attr(xd, "add_offset");
      const ys = attr(yd, "scale_factor");
      const yo = attr(yd, "add_offset");
      return {
        width,
        height,
        x0: (x[0] * xs + xo) * hp,
        y0: (y[0] * ys + yo) * hp,
        dx: (x[1] - x[0]) * xs * hp,
        dy: -(y[1] - y[0]) * ys * hp,
        lon0: attr(proj, "longitude_of_projection_origin"),
        counts: countsFromCmi(cmi.value, attr(cmi, "scale_factor"), attr(cmi, "add_offset"), attr(cmi, "_FillValue")),
      };
    } finally {
      f.close();
    }
  } finally {
    try { FS.unlink(scratch); } catch { /* scratch may not exist on decode failure */ }
  }
}

/**
 * The encoded frame for a stamp, from cache or the bucket. Single-flight
 * per stamp so a loop's parallel asks never download a scan twice.
 *
 * @param {String} stamp YYYYMMDDHHMM (scan start, UTC)
 * @returns {Promise<Object|null>} payload, or null when no scan has that stamp
 */
async function fetchFrame(stamp) {
  const hit = frameCache.get(stamp);
  if (hit) {
    frameCache.delete(stamp);
    frameCache.set(stamp, hit);
    return hit;
  }
  if (inflight.has(stamp)) return inflight.get(stamp);
  const job = (async () => {
    const t = Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(8, 10), +stamp.slice(10, 12));
    const scans = await listScans(t, t + 59999);
    if (!scans.length) return null;
    const res = await axios.get(`${BUCKET_BASE}/${scans[0].key}`, { responseType: "arraybuffer", timeout: API_TIMEOUT_MS });
    increment("goes", "file");
    const frame = await decodeCmipBuffer(new Uint8Array(res.data));
    const payload = {
      stamp,
      epoch: scans[0].epoch,
      width: frame.width,
      height: frame.height,
      x0: frame.x0,
      y0: frame.y0,
      dx: frame.dx,
      dy: frame.dy,
      lon0: frame.lon0,
      counts: zlib.deflateSync(frame.counts).toString("base64"),
    };
    frameCache.set(stamp, payload);
    while (frameCache.size > FRAME_CACHE_MAX) frameCache.delete(frameCache.keys().next().value);
    return payload;
  })();
  inflight.set(stamp, job);
  try {
    return await job;
  } finally {
    inflight.delete(stamp);
  }
}

/**
 * GET /api/satellite/ir/frames?minutes=60 — channel-13 scans in the last
 * `minutes` (max 180), oldest first: `{available, frames: [{stamp, epoch}]}`.
 *
 * @param {Object} req
 * @param {Object} res
 */
async function getIrFrames(req, res) {
  const minutes = Math.min(MAX_MINUTES, Math.max(5, Number(req.query.minutes) || DEFAULT_MINUTES));
  try {
    const now = Date.now();
    const scans = await listScans(now - minutes * 60000, now);
    recordServiceCall(SERVICE_NAME, 200, `${scans.length} scans in ${minutes} min`);
    return res.status(200).json({ available: true, frames: scans.map(({ stamp, epoch }) => ({ stamp, epoch })) }).end();
  } catch (err) {
    recordServiceCall(SERVICE_NAME, err?.response?.status || 500, `scan list unavailable: ${err.message}`);
    return res.status(200).json({ available: false, reason: "upstream-unavailable", frames: [] }).end();
  }
}

/**
 * GET /api/satellite/ir/frame?stamp=YYYYMMDDHHMM — one scan as deflated,
 * base64'd brightness counts plus its fixed-grid geometry.
 *
 * @param {Object} req
 * @param {Object} res
 */
async function getIrFrame(req, res) {
  const stamp = String(req.query.stamp || "");
  if (!/^\d{12}$/.test(stamp)) return res.status(400).json({ error: "stamp must be YYYYMMDDHHMM" }).end();
  try {
    const payload = await fetchFrame(stamp);
    if (!payload) return res.status(404).json({ error: "no scan with that stamp" }).end();
    return res.status(200).json(payload).end();
  } catch (err) {
    recordServiceCall(SERVICE_NAME, err?.response?.status || 500, `scan ${stamp} unavailable: ${err.message}`);
    return res.status(502).json({ error: "scan unavailable" }).end();
  }
}

module.exports = {
  getIrFrames,
  getIrFrame,
  keyEpoch,
  stampOf,
  hourPrefix,
  kelvinToCount,
  countsFromCmi,
  decodeCmipBuffer,
  SERVICE_NAME,
};
