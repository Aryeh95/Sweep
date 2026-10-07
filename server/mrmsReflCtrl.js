// MRMS reflectivity mosaic — the low-zoom radar layer, with IEM's N0Q
// tiles as the fallback.
//
// WHY MRMS: on 2026-10-07 the national Level III feed stopped at 13:36 Z.
// IEM keeps stamping a new N0Q composite every 5 minutes and drops each
// radar as its data ages out, so its tiles drained to blank over ~20
// minutes while the metadata still claimed 142/147 radars — the map went
// empty under a green "Mosaic · now" chip. MRMS is built by NCEP from the
// radars' Level II data, which kept flowing; its newest file was ~1 min old
// throughout.
//
// Product: `CONUS/ReflectivityAtLowestAltitude_00.50` — reflectivity from
// the lowest radar beam over each point, the MRMS counterpart of base
// reflectivity (what IEM's N0Q mosaic and the single-site N0B layer show).
// NOT `MergedReflectivityQCComposite`, the column maximum, which paints
// rain aloft that never reaches the ground and would not match the site
// layer at the crossfade. 7000 × 3500 cells of 0.01° (~1 km), a new file
// every ~2 min, ~490 KB gzipped GRIB2; values in dBZ, −99 = no echo,
// −999 = no coverage. Decodes through the hail controller's GRIB2 PNG path
// unchanged (≈ 0.7 s).
//
// Cells are re-encoded on IEM's N0Q scale (level = (dBZ + 32.5) × 2,
// 0 = nothing) so the client paints them with the same palette LUT as the
// radial and tile layers, and kept at the native 1 km (the N0Q mosaic is
// ~1 km too; 2 km looked blocky at the band's z7–8). zlib level 1: 24 ms
// in Node, ~450 KB, against 71 ms / 360 KB at level 6 — the app runs this
// controller in the phone's WebView, where speed matters more than bytes.

const zlib = require("zlib");
const { recordServiceCall } = require("./serviceStatus");
const { latestKey, listDayKeys, keyNearest, keyValidTime, fetchGrid } = require("./mrmsHailCtrl");
const { BoundedMap } = require("./boundedCache");

const SERVICE_NAME = "MRMS (reflectivity mosaic)";
const PRODUCT = "CONUS/ReflectivityAtLowestAltitude_00.50";
// The N0Q byte scale: dBZ = level × increment + min.
const SCALING = { min: -32.5, increment: 0.5 };
// Below this the value is a missing-data code (−99 / −999), not an echo.
const MIN_ECHO_DBZ = -30;
// An exact frame: the file whose time is within this of the request.
const STAMP_WINDOW_MS = 60 * 1000;
const MAX_LIST_MINUTES = 180;

const payloadCache = new BoundedMap(16);
const inflight = new Map();

/**
 * "YYYYMMDDHHMMSS" (UTC) for an ISO time.
 *
 * @param {String} iso time
 * @returns {String} 14-digit stamp
 */
function stampOf(iso) {
  return new Date(iso).toISOString().slice(0, 19).replace(/[-:T]/g, "");
}

/**
 * Parse a 14-digit (or 12-digit, seconds 00) UTC stamp.
 *
 * @param {String} stamp digits
 * @returns {Number} epoch ms, NaN when malformed
 */
function stampEpoch(stamp) {
  if (!/^\d{12}(\d{2})?$/.test(stamp || "")) return NaN;
  return Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8),
    +stamp.slice(8, 10), +stamp.slice(10, 12), +(stamp.slice(12, 14) || 0));
}

/**
 * Re-encode a decoded RALA field as N0Q-scale bytes.
 *
 * @param {{g: Object, samples: Uint16Array}} field decoded GRIB2 (see mrmsHailCtrl.fetchGrid)
 * @returns {{grid: Object, cells: Uint8Array, drawn: Number, maxDbz: Number}} cells and their CELL-CENTRE geometry
 */
function buildCells({ g, samples }) {
  const scale = (2 ** g.binScale) / (10 ** g.decScale);
  const offset = g.ref / (10 ** g.decScale);
  // One lookup per possible 16-bit sample: 24.5 M cells through a table is
  // ~70 ms, the arithmetic per cell several times that.
  const lut = new Uint8Array(65536);
  for (let s = 0; s < 65536; s += 1) {
    const dbz = offset + s * scale;
    if (dbz > MIN_ECHO_DBZ) lut[s] = Math.min(255, Math.max(1, Math.round((dbz - SCALING.min) / SCALING.increment)));
  }
  const cells = new Uint8Array(samples.length);
  let drawn = 0;
  let maxLevel = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const level = lut[samples[i]];
    if (!level) continue;
    cells[i] = level;
    drawn += 1;
    if (level > maxLevel) maxLevel = level;
  }
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  return {
    grid: {
      ni: g.ni,
      nj: g.nj,
      lat0: r6(g.lat0),
      lon0: r6(g.lon0 > 180 ? g.lon0 - 360 : g.lon0),
      dLat: r6(g.dLat),
      dLon: r6(g.dLon),
    },
    cells,
    drawn,
    maxDbz: maxLevel ? maxLevel * SCALING.increment + SCALING.min : null,
  };
}

/**
 * Build (or reuse) the payload for one file. Single-flight per key.
 *
 * @param {String} key bucket key
 * @returns {Promise<Object>} payload
 */
async function payloadFor(key) {
  const hit = payloadCache.get(key);
  if (hit) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const field = await fetchGrid(key, "refl");
    const { grid, cells, drawn, maxDbz } = buildCells(field);
    const value = {
      available: true,
      source: "MRMS",
      product: "ReflectivityAtLowestAltitude",
      validTime: field.validTime,
      stamp: stampOf(field.validTime),
      key: key.split("/").pop(),
      grid,
      encoding: "deflate8",
      scaling: SCALING,
      drawn,
      maxDbz,
      data: zlib.deflateSync(cells, { level: 1 }).toString("base64"),
    };
    payloadCache.set(key, value);
    recordServiceCall(SERVICE_NAME, 200, `${drawn} echo cells (max ${maxDbz} dBZ) in ${value.key}`);
    return value;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

/**
 * GET /api/radar/refl-mosaic[?stamp=YYYYMMDDHHMMSS] — the newest MRMS
 * reflectivity frame, or the one at a stamp (±60 s).
 *
 * @param {Object} req
 * @param {Object} res
 */
async function getReflMosaic(req, res) {
  const stamp = req.query.stamp !== undefined ? String(req.query.stamp).trim() : null;
  if (stamp !== null && !Number.isFinite(stampEpoch(stamp))) return res.status(400).json("Invalid stamp").end();
  try {
    const key = stamp ? await keyNearest(PRODUCT, stampEpoch(stamp), STAMP_WINDOW_MS) : await latestKey(PRODUCT);
    if (!key) {
      recordServiceCall(SERVICE_NAME, 200, stamp ? `no frame at ${stamp}` : "no recent frame in the bucket");
      return res.status(200).json({ available: false, source: "MRMS", stamp, reason: stamp ? "no-matching-frame" : "no-recent-product" }).end();
    }
    return res.status(200).json(await payloadFor(key)).end();
  } catch (err) {
    const status = err?.response?.status || 500;
    recordServiceCall(SERVICE_NAME, status, `reflectivity mosaic failed: ${err.message}`);
    return res.status(503).json({ available: false, source: "MRMS", reason: "upstream-unavailable" }).end();
  }
}

/**
 * GET /api/radar/refl-mosaic/frames?minutes=60 — every MRMS reflectivity
 * file in the window, oldest first: `{available, frames: [{stamp, epoch}]}`.
 * The client builds its timeline from these and falls back to IEM when the
 * newest is too old or the list fails.
 *
 * @param {Object} req
 * @param {Object} res
 */
async function getReflFrames(req, res) {
  const minutes = Math.min(MAX_LIST_MINUTES, Math.max(5, Number(req.query.minutes) || 60));
  const now = Date.now();
  const from = now - minutes * 60000;
  try {
    const days = [new Date(now)];
    if (new Date(from).getUTCDate() !== new Date(now).getUTCDate()) days.unshift(new Date(from));
    const frames = [];
    for (const d of days) {
      // eslint-disable-next-line no-await-in-loop -- at most two small, cached listings
      for (const key of await listDayKeys(PRODUCT, d)) {
        const iso = keyValidTime(key);
        const epoch = Date.parse(iso || "");
        if (Number.isFinite(epoch) && epoch >= from && epoch <= now + 60000) frames.push({ stamp: stampOf(iso), epoch });
      }
    }
    frames.sort((a, b) => a.epoch - b.epoch);
    return res.status(200).json({ available: true, frames }).end();
  } catch (err) {
    recordServiceCall(SERVICE_NAME, err?.response?.status || 500, `frame list failed: ${err.message}`);
    return res.status(200).json({ available: false, reason: "upstream-unavailable", frames: [] }).end();
  }
}

module.exports = {
  getReflMosaic,
  getReflFrames,
  // Exported for tests.
  buildCells,
  stampOf,
  stampEpoch,
  SCALING,
  PRODUCT,
  SERVICE_NAME,
};
