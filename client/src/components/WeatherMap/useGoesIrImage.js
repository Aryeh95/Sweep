// Fetch and decode IEM's raw GOES-East channel-13 scan for the colour-
// enhanced infrared layer (ColorIrLayer).
//
// One ~1.9 MB paletted PNG per 5-minute scan, fetched straight from IEM
// like every satellite and radar tile (CORS is `*`), keyed on the scan's
// valid time from /api/radar/frames so a new download happens only when
// IEM has published a new scan. Decoding (inflate + PNG unfilter) is
// ~130 ms in Node for the 2500 × 1500 grid; the result is 3.75 MB of
// counts, released as soon as the mode is turned off.

import { useEffect, useState } from "react";
import { inflate } from "pako";
import { decodeIndexedPng, parseWorldFile } from "~/ui/irEnhancement";
import { IR_IMAGE_BASE, IR_IMAGE_LON0 } from "~/ui/satellite";

const LATEST_DELAY_MS = 5000;

/**
 * @param {object} params
 * @param {Boolean} params.enabled false releases the decoded scan
 * @param {Number|null} params.validEpoch the newest scan's valid time (ms), from the frames poller
 * @returns {object|null} {width, height, data, x0, y0, dx, dy, lon0, epoch} or null until the first scan decodes
 */
export default function useGoesIrImage({ enabled, validEpoch }) {
  const [grid, setGrid] = useState(null);
  // Without metadata, fetch once ("latest") rather than never — but only
  // after giving the frames poller a moment, or turning the mode on before
  // its first answer downloads the 1.9 MB scan twice.
  const key = Number.isFinite(validEpoch) ? validEpoch : "latest";

  useEffect(() => {
    if (!enabled) {
      setGrid(null);
      return undefined;
    }
    let cancelled = false;
    const load = () => {
      const bust = `?v=${key === "latest" ? Math.floor(Date.now() / 300000) : key}`;
      Promise.all([
        fetch(`${IR_IMAGE_BASE}.png${bust}`).then((r) => {
          if (!r.ok) throw new Error(`satellite image HTTP ${r.status}`);
          return r.arrayBuffer();
        }),
        fetch(`${IR_IMAGE_BASE}.wld${bust}`).then((r) => {
          if (!r.ok) throw new Error(`satellite world file HTTP ${r.status}`);
          return r.text();
        }),
      ])
        .then(([png, wld]) => {
          if (cancelled) return;
          const world = parseWorldFile(wld);
          if (!world) throw new Error("satellite world file malformed");
          const img = decodeIndexedPng(new Uint8Array(png), (z) => inflate(z));
          setGrid({
            ...img,
            ...world,
            lon0: IR_IMAGE_LON0,
            epoch: Number.isFinite(key) ? key : null,
          });
        })
        .catch((err) => {
          // Keep the last scan on screen; the age chip shows it getting old.
          if (!cancelled) console.warn("[satellite] colour IR scan unavailable:", err.message);
        });
    };
    const timer = setTimeout(load, key === "latest" ? LATEST_DELAY_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, key]);

  return enabled ? grid : null;
}
