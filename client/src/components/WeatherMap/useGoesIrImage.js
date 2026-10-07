// The newest GOES-East channel-13 scan for the infrared layers
// (ColorIrLayer), from NOAA's CMIP files via /api/satellite/ir/frames and
// /api/satellite/ir/frame — the same source and decode as the loop
// history (useSatelliteLoop).
//
// WHY NOT IEM'S LIVE IMAGE: this used to fetch IEM's `GOES-19_C13.png`.
// On 2026-10-07 that image was published with rows 512–1499 (two-thirds
// of the sector) filled with count 162 — IEM's no-data value, which is
// also a real temperature (−24 °C) — and then not replaced for 18 min, so
// the map showed a flat cloud deck below a wavy scan-row edge. NOAA's file
// for the same scan was complete, marks missing data as fill (count 0,
// transparent), and is published ~1 min after the scan instead of 5–8.
//
// Polls the scan list every minute and downloads a scan only when a newer
// one appears (~3.8 MB from NOAA per 5-minute scan on the server side).
// A failed fetch keeps the last scan on screen; the age chip shows it
// getting old.

import { useEffect, useState } from "react";
import axios from "axios";
import { inflate } from "pako";
import { decodeBins } from "./radialRender";

const LIST_REFRESH_MS = 60 * 1000;

/**
 * @param {object} params
 * @param {Boolean} params.enabled false releases the decoded scan
 * @param {Boolean} [params.paused] stops polling but keeps the scan
 * @returns {object|null} {width, height, data, x0, y0, dx, dy, lon0, epoch} or null until the first scan decodes
 */
export default function useGoesIrImage({ enabled, paused = false }) {
  const [grid, setGrid] = useState(null);
  const [newest, setNewest] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setGrid(null);
      setNewest(null);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || paused) return undefined;
    let cancelled = false;
    const load = () => {
      axios.get("/api/satellite/ir/frames", { params: { minutes: 30 } })
        .then((res) => {
          const frames = (res.data && res.data.available && res.data.frames) || [];
          if (!cancelled && frames.length) setNewest(frames[frames.length - 1].stamp);
        })
        .catch(() => { /* keep the last scan */ });
    };
    load();
    const id = setInterval(load, LIST_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, paused]);

  useEffect(() => {
    if (!enabled || !newest) return undefined;
    let cancelled = false;
    axios.get("/api/satellite/ir/frame", { params: { stamp: newest } })
      .then((res) => {
        const d = res.data || {};
        if (cancelled || !d.counts) return;
        const { counts, ...geometry } = d;
        setGrid({ ...geometry, data: inflate(decodeBins(counts)) });
      })
      .catch((err) => {
        if (!cancelled) console.warn("[satellite] infrared scan unavailable:", err.message);
      });
    return () => { cancelled = true; };
  }, [enabled, newest]);

  return enabled ? grid : null;
}
