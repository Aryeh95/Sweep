/* Low-zoom radar mosaic source: MRMS reflectivity when it is current, IEM's
 * N0Q tiles otherwise. Pure functions; the fetching lives in
 * components/WeatherMap/useReflMosaic.js.
 *
 * The timeline keeps the shape the IEM mosaic gave it — eleven frames five
 * minutes apart, newest last — but each frame is a REAL MRMS file (they
 * arrive every ~2 min at irregular seconds): the newest, then the file
 * nearest each 5-minute step back. A step with no file within the
 * tolerance is left out rather than filled with a neighbour, so every
 * frame's time on the age chip is the time of the picture.
 */

export const MOSAIC_FRAME_COUNT = 11;
export const MOSAIC_STEP_MS = 5 * 60 * 1000;
export const MOSAIC_PICK_TOLERANCE_MS = 150 * 1000;
// MRMS publishes every ~2 min; ten minutes without a file means it is down
// (or the bucket listing is), and the IEM tiles take over.
export const MRMS_STALE_MS = 10 * 60 * 1000;

/**
 * Timeline frames from the MRMS file list.
 *
 * @param {Array<{stamp: String, epoch: Number}>} list files, oldest first
 * @param {Number} [count] frames wanted
 * @param {Number} [stepMs] spacing between frames
 * @param {Number} [toleranceMs] largest |file − step| accepted
 * @returns {Array<{stamp: String, epoch: Number}>} chosen files, oldest first
 */
export function pickMrmsFrames(list, count = MOSAIC_FRAME_COUNT, stepMs = MOSAIC_STEP_MS, toleranceMs = MOSAIC_PICK_TOLERANCE_MS) {
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
export function mrmsUsable(list, nowMs, staleMs = MRMS_STALE_MS) {
  return Boolean(list && list.length) && nowMs - list[list.length - 1].epoch <= staleMs;
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
export function reflDbzAt(field, lat, lon) {
  if (!field || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const { grid, cells } = field;
  const r = Math.round((grid.lat0 - lat) / grid.dLat);
  const c = Math.round((lon - grid.lon0) / grid.dLon);
  if (r < 0 || c < 0 || r >= grid.nj || c >= grid.ni) return null;
  const level = cells[r * grid.ni + c];
  return level ? level * 0.5 - 32.5 : null;
}
