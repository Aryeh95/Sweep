// Historical GOES-East infrared scans for the radar timeline — the
// satellite counterpart of usePrecipMosaicLoop.
//
// Lists the scans the timeline spans (/api/satellite/ir/frames), thins
// them to a frame budget (ui/satelliteLoop.js), and fetches the chosen
// ones one at a time from /api/satellite/ir/frame. Frames are kept
// DEFLATED (~1.9 MB each); WeatherMap inflates only the one under the
// playhead (~3.75 MB, a few tens of ms), so a 12-frame loop holds ~23 MB
// rather than ~45 MB decoded. Like the radar loop, everything loads when
// playback starts, not when the timeline opens; paused scrubbing fetches
// only the frame under the playhead.

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { decodeBins } from "./radialRender";
import { thinScans, pickScan } from "~/ui/satelliteLoop";

const LIST_REFRESH_MS = 60 * 1000;
const MISS_RETRY_MS = 2 * 60 * 1000;
// Pause between fetches so a burst of frames does not starve the live polls.
const PACE_MS = 200;

/**
 * @param {object} params
 * @param {Boolean} params.enabled an infrared mode is on and the timeline is open; false clears everything
 * @param {Boolean} params.active playback running — load every chosen scan
 * @param {Number|null} params.spanFrom oldest timeline time, ms
 * @param {Number|null} params.spanTo newest timeline time that needs history, ms
 * @param {Number|null} params.scrubEpoch paused playhead time on history, ms (fetch just that scan)
 * @param {Boolean} [params.paused] stops the pumps but keeps the cache
 * @returns {{scans: Array, byStamp: object}} chosen scans and the loaded ones
 */
export default function useSatelliteLoop({ enabled, active, spanFrom, spanTo, scrubEpoch, paused = false }) {
  const [list, setList] = useState([]);
  const [byStamp, setByStamp] = useState({});
  const cacheRef = useRef(new Map());
  const generationRef = useRef(0);
  // Listing window from the track's LENGTH (not the clock), in 30-minute
  // buckets plus slack, so it is not re-keyed as time passes or frames roll.
  const minutes = Number.isFinite(spanFrom) && Number.isFinite(spanTo)
    ? Math.min(180, Math.ceil((spanTo - spanFrom) / 1800000) * 30 + 30)
    : 60;
  const wantList = enabled && (active || Number.isFinite(scrubEpoch));

  useEffect(() => {
    generationRef.current += 1;
    cacheRef.current.clear();
    setByStamp({});
    if (!enabled) setList([]);
  }, [enabled]);

  useEffect(() => {
    if (!wantList || paused) return undefined;
    let cancelled = false;
    const load = () => {
      axios.get("/api/satellite/ir/frames", { params: { minutes } })
        .then((res) => {
          const d = res.data || {};
          if (!cancelled && d.available && Array.isArray(d.frames)) setList(d.frames);
        })
        .catch(() => { /* keep the last list */ });
    };
    load();
    const id = setInterval(load, LIST_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [wantList, paused, minutes]);

  const scansAll = useMemo(
    () => (Number.isFinite(spanFrom) && Number.isFinite(spanTo) ? thinScans(list, spanFrom, spanTo) : []),
    [list, spanFrom, spanTo],
  );
  // Same identity while the chosen scans are the same.
  const scansKey = scansAll.map((s) => s.stamp).join(",");
  const scans = useMemo(() => scansAll, [scansKey]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on content
  const scrubStamp = Number.isFinite(scrubEpoch) ? (pickScan(scans, scrubEpoch) || {}).stamp || null : null;
  // Joined so a list refresh that changes nothing does not restart the
  // pump (which would drop and re-download the frame in flight).
  const stampsKey = !enabled ? "" : (active ? scans.map((s) => s.stamp).reverse().join(",") : (scrubStamp || ""));
  const stamps = useMemo(() => (stampsKey ? stampsKey.split(",") : []), [stampsKey]);

  useEffect(() => {
    if (!enabled || paused) return undefined;
    const gen = generationRef.current;
    let cancelled = false;
    const wanted = new Set(stamps);
    let evicted = false;
    for (const k of [...cacheRef.current.keys()]) {
      if (!wanted.has(k)) {
        cacheRef.current.delete(k);
        evicted = true;
      }
    }
    const publish = () => {
      const out = {};
      for (const [k, v] of cacheRef.current) if (v && v.z) out[k] = v;
      setByStamp(out);
    };
    if (evicted) publish();
    const next = () => stamps.find((s) => {
      const v = cacheRef.current.get(s);
      return v === undefined || Boolean(v && v.miss && Date.now() - v.at > MISS_RETRY_MS);
    });
    const pump = async () => {
      let s = next();
      while (!cancelled && generationRef.current === gen && s) {
        try {
          const res = await axios.get("/api/satellite/ir/frame", { params: { stamp: s } });
          const d = res.data || {};
          if (cancelled || generationRef.current !== gen) return;
          if (d.counts) {
            const { counts, ...geometry } = d;
            cacheRef.current.set(s, { ...geometry, z: decodeBins(counts) });
            publish();
          } else {
            cacheRef.current.set(s, { miss: true, at: Date.now() });
          }
        } catch {
          cacheRef.current.set(s, { miss: true, at: Date.now() });
        }
        await new Promise((r) => setTimeout(r, PACE_MS));
        s = next();
      }
    };
    pump();
    return () => { cancelled = true; };
  }, [enabled, paused, stamps]);

  return { scans, byStamp };
}
