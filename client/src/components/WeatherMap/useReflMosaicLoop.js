// Historical MRMS reflectivity-mosaic frames for loop playback at mosaic
// zoom — usePrecipMosaicLoop's counterpart for the radar layer.
//
// Each frame stamp is an exact MRMS file time ("YYYYMMDDHHMMSS", from
// useReflMosaic's frame list), fetched from /api/radar/refl-mosaic?stamp=.
// Payloads are kept DEFLATED (~450 KB each) rather than decoded — eleven
// decoded 1 km CONUS fields would be ~270 MB — and WeatherMap inflates the
// one under the playhead (decodeReflPayload, ~200 ms). Misses are
// remembered briefly and retried, like the other loops.

import { useState, useEffect, useRef } from "react";
import axios from "axios";

const MISS_RETRY_MS = 2 * 60 * 1000;
// Pause between fetches so a burst of eleven does not starve the live polls.
const PACE_MS = 200;

/**
 * Keep reflectivity-mosaic payloads cached for a list of stamps.
 *
 * @param {object} params
 * @param {Array<String>} params.stamps frame stamps, in fetch-priority order
 * @param {Boolean} params.enabled false stops fetching and clears everything
 * @param {Boolean} [params.paused] true stops the pump but keeps the cache
 * @returns {{byStamp: object}} stamp → payload (base64 `data` still deflated)
 */
export default function useReflMosaicLoop({ stamps, enabled, paused = false }) {
  const [byStamp, setByStamp] = useState({});
  const cacheRef = useRef(new Map());
  const generationRef = useRef(0);

  // Leaving the mode drops everything; `paused` deliberately does not.
  useEffect(() => {
    generationRef.current += 1;
    cacheRef.current.clear();
    setByStamp({});
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !stamps || !stamps.length) return undefined;
    if (paused) return undefined;
    const gen = generationRef.current;
    let cancelled = false;

    const publish = () => {
      const out = {};
      for (const [k, v] of cacheRef.current) {
        if (v && v.data) out[k] = v;
      }
      setByStamp(out);
    };

    const wanted = new Set(stamps);
    let evicted = false;
    for (const k of [...cacheRef.current.keys()]) {
      if (!wanted.has(k)) {
        cacheRef.current.delete(k);
        evicted = true;
      }
    }
    if (evicted) publish();

    const nextStamp = () => stamps.find((s) => {
      const v = cacheRef.current.get(s);
      if (v === undefined) return true;
      return Boolean(v && v.miss && Date.now() - v.at > MISS_RETRY_MS);
    });

    const pump = async () => {
      let s = nextStamp();
      while (!cancelled && generationRef.current === gen && s) {
        try {
          const res = await axios.get("/api/radar/refl-mosaic", { params: { stamp: s } });
          const d = res.data || {};
          if (cancelled || generationRef.current !== gen) return;
          if (d.available && d.grid && d.data) {
            cacheRef.current.set(s, d);
            publish();
          } else {
            cacheRef.current.set(s, { miss: true, at: Date.now() });
          }
        } catch {
          cacheRef.current.set(s, { miss: true, at: Date.now() });
        }
        await new Promise((r) => setTimeout(r, PACE_MS));
        s = nextStamp();
      }
    };
    pump();

    return () => { cancelled = true; };
  }, [enabled, paused, stamps]);

  return { byStamp };
}
