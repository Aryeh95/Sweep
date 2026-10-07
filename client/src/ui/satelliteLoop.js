/* Satellite loop: which GOES-East scans to load for the radar timeline,
 * and which one to show under the playhead. Pure functions; the fetching
 * lives in components/WeatherMap/useSatelliteLoop.js.
 *
 * The timeline is driven by the radar (11 mosaic offsets ≈ 50 min at low
 * zoom, ~30 site scans ≈ 2–2.5 h at high zoom). The satellite scans every
 * 5 minutes, so a 2.5-hour track would mean 30 frames of ~2.6 MB each;
 * the loop is thinned instead to at most SAT_LOOP_MAX_FRAMES evenly
 * spaced scans, anchored on the newest — every 5 min at low zoom, every
 * 15 min on the long track — and each playhead position shows the newest
 * loaded scan at or before its time.
 */

export const SAT_LOOP_MAX_FRAMES = 12;
export const SAT_SCAN_MS = 5 * 60 * 1000;
// A radar frame and the satellite scan "at" it can be a couple of
// minutes apart either way (scan start times vs. volume-scan times).
export const SAT_PICK_TOLERANCE_MS = 150 * 1000;

/**
 * Scans to load for a timeline spanning [fromMs, toMs], oldest first:
 * every scan in the span (plus one scan of slack before it) when they
 * fit, otherwise every Nth counting back from the newest.
 *
 * @param {Array<{stamp: String, epoch: Number}>} scans available scans, oldest first
 * @param {Number} fromMs oldest timeline time
 * @param {Number} toMs newest timeline time that needs a loop frame
 * @param {Number} [max] frame budget
 * @returns {Array<{stamp: String, epoch: Number}>} chosen scans, oldest first
 */
export function thinScans(scans, fromMs, toMs, max = SAT_LOOP_MAX_FRAMES) {
  const inSpan = (scans || []).filter((s) => s.epoch >= fromMs - SAT_SCAN_MS && s.epoch <= toMs + SAT_PICK_TOLERANCE_MS);
  if (inSpan.length <= max) return inSpan;
  const stride = Math.ceil(inSpan.length / max);
  const out = [];
  for (let i = inSpan.length - 1; i >= 0; i -= stride) out.unshift(inSpan[i]);
  return out;
}

/**
 * The scan to show at a playhead time: the newest chosen scan at or
 * before it, or null when the nearest one is further back than the loop's
 * own spacing (the layer hides rather than claim a time it does not have).
 *
 * @param {Array<{stamp: String, epoch: Number}>} scans chosen scans (thinScans)
 * @param {Number} epoch playhead time, ms
 * @returns {{stamp: String, epoch: Number}|null} scan, or null
 */
export function pickScan(scans, epoch) {
  if (!scans || !scans.length || !Number.isFinite(epoch)) return null;
  let spacing = SAT_SCAN_MS;
  for (let i = 1; i < scans.length; i += 1) spacing = Math.max(spacing, scans[i].epoch - scans[i - 1].epoch);
  let best = null;
  for (const s of scans) {
    if (s.epoch <= epoch + SAT_PICK_TOLERANCE_MS && (!best || s.epoch > best.epoch)) best = s;
  }
  if (!best || epoch - best.epoch > spacing + SAT_PICK_TOLERANCE_MS) return null;
  return best;
}
