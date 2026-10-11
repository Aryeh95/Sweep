// The MRMS reflectivity mosaic for the low-zoom radar layer, and whether it
// is fit to replace IEM's N0Q tiles right now (see server/mrmsReflCtrl.js
// for why it is the primary source, and ui/mosaicSource.js for the rules).
//
// Polls the file list every minute; when the newest file changes and the
// mosaic band is on screen, fetches that frame (~600 KB of base64, a
// 1 km CONUS grid deflated) and keeps it DECODED (7000 × 3500 bytes,
// ~24.5 MB) for PrecipMosaicLayer to paint the viewport from. `usable`
// goes false — and WeatherMap falls back to IEM — when the list fails,
// the newest file is older than MRMS_STALE_MS, frames repeatedly fail to
// load, or there is no recent decoded frame to paint (mrmsReady). A failed
// frame is retried every FRAME_RETRY_MS while IEM covers for it.

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { inflate } from "pako";
import { decodeBins } from "./radialRender";
import { mrmsReady, mrmsUsable, pickMrmsFrames } from "~/ui/mosaicSource";

const LIST_REFRESH_MS = 60 * 1000;
// Consecutive frame-load failures after which MRMS is treated as down.
const MAX_FRAME_FAILURES = 2;
// A failed frame is fetched again after this long — while IEM covers for it.
const FRAME_RETRY_MS = 20 * 1000;

/**
 * Decode a refl-mosaic payload into a paintable field.
 *
 * @param {object} d payload from /api/radar/refl-mosaic
 * @returns {{key: String, grid: object, cells: Uint8Array, validTime: String}} field
 */
export function decodeReflPayload(d) {
  return { key: d.key, grid: d.grid, cells: inflate(decodeBins(d.data)), validTime: d.validTime };
}

/**
 * @param {object} params
 * @param {Boolean} params.enabled the reflectivity mosaic is wanted at all (radar on, no MRMS mode replacing it)
 * @param {Boolean} params.liveEnabled the mosaic band is on screen — fetch and keep the newest frame
 * @param {Boolean} [params.paused] stops polling, keeps state
 * @returns {{usable: Boolean, pending: Boolean, frames: Array, field: object|null, stale: Boolean}} the source decision (`pending` until the first list answer, so a cold start does not flash the fallback), the timeline frames, the newest decoded field
 */
export default function useReflMosaic({ enabled, liveEnabled, paused = false }) {
  const [list, setList] = useState(null);
  const [listFailed, setListFailed] = useState(false);
  const [field, setField] = useState(null);
  const [frameFailures, setFrameFailures] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const fieldKeyRef = useRef(null);

  useEffect(() => {
    if (enabled) return;
    setList(null);
    setListFailed(false);
    setField(null);
    setFrameFailures(0);
    fieldKeyRef.current = null;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || paused) return undefined;
    let cancelled = false;
    const load = () => {
      setNow(Date.now());
      axios.get("/api/radar/refl-mosaic/frames", { params: { minutes: 60 } })
        .then((res) => {
          if (cancelled) return;
          const d = res.data || {};
          if (d.available && Array.isArray(d.frames)) {
            setList(d.frames);
            setListFailed(false);
          } else {
            setListFailed(true);
          }
        })
        .catch(() => { if (!cancelled) setListFailed(true); });
    };
    load();
    const id = setInterval(load, LIST_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, paused]);

  // Whether to draw MRMS: a fresh list AND a decoded frame to paint (or the
  // first one still loading cleanly) — see mrmsReady.
  const usable = enabled && mrmsReady({
    list, listFailed, frameFailures, fieldValidTime: field ? field.validTime : null, nowMs: now,
  }, MAX_FRAME_FAILURES);
  const newestStamp = list && list.length ? list[list.length - 1].stamp : null;
  // Frames keep loading while the LIST is healthy, even when IEM is on
  // screen because frames failed: a success is what brings MRMS back. (It
  // used to be gated on `usable`, so a failure streak could only clear by
  // resetting the count on every new file — which also meant a run of bad
  // frames never reached the fallback.)
  const listOk = enabled && !listFailed && mrmsUsable(list, now);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!listOk || !liveEnabled || !newestStamp || paused) return undefined;
    if (fieldKeyRef.current === newestStamp) return undefined;
    let cancelled = false;
    let retry = null;
    const fail = () => {
      if (cancelled) return;
      setFrameFailures((n) => n + 1);
      retry = setTimeout(() => setRetryTick((n) => n + 1), FRAME_RETRY_MS);
    };
    axios.get("/api/radar/refl-mosaic", { params: { stamp: newestStamp } })
      .then((res) => {
        if (cancelled) return;
        const d = res.data || {};
        if (!d.available || !d.data) {
          fail();
          return;
        }
        // Decode BEFORE marking the stamp loaded: a payload that fails to
        // inflate must stay eligible for the retry.
        const decoded = decodeReflPayload(d);
        fieldKeyRef.current = newestStamp;
        setField(decoded);
        setFrameFailures(0);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [listOk, liveEnabled, newestStamp, paused, retryTick]);

  const frames = useMemo(() => pickMrmsFrames(list || []), [list]);
  const pending = enabled && list === null && !listFailed;
  return { usable, pending, frames, field: usable ? field : null, stale: listFailed };
}
