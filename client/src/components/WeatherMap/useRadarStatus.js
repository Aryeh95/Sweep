// Poller for which NEXRAD radars are offline (server/radarStatusCtrl.js).
//
// Only runs while the site picker is on screen: the answer changes on the
// scale of hours, the server caches it for five minutes, and nothing else
// in the app reads it.

import { useState, useEffect, useRef } from "react";
import axios from "axios";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const EMPTY = { sites: {}, fetchedAt: null, stale: false };

/**
 * Keep the per-radar operating state fresh.
 *
 * @param {Object} params
 * @param {Boolean} params.enabled false stops polling and clears the map
 * @param {Boolean} [params.paused] true suspends polling but keeps the map
 * @returns {{sites: Object<String, {state: String, reason: String|null, ageMin: Number|null, lastDataTime: String|null}>, fetchedAt: String|null, stale: Boolean}}
 */
export default function useRadarStatus({ enabled, paused = false }) {
  const [state, setState] = useState(EMPTY);
  // Generation of the effect run a response belongs to: bumped by every
  // run and cleanup, so a slow answer for a previous site / pin is dropped
  // (a shared `cancelled` boolean is reset by the next run and let it in).
  const genRef = useRef(0);

  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;
    if (!enabled) {
      setState(EMPTY);
      return () => { genRef.current += 1; };
    }
    if (paused) return undefined;

    const fetchStatus = () => {
      axios.get("/api/radar/status")
        .then((res) => {
          if (genRef.current !== gen) return;
          const d = res.data || {};
          if (!d.available) {
            setState((prev) => ({ ...prev, stale: true }));
            return;
          }
          setState({ sites: d.sites || {}, fetchedAt: d.fetchedAt || null, stale: Boolean(d.stale) });
        })
        .catch(() => {
          if (genRef.current !== gen) return;
          // Keep the last answer rather than turning every chip back to
          // "fine": an outage that was real an hour ago probably still is.
          setState((prev) => ({ ...prev, stale: true }));
        });
    };

    fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      genRef.current += 1;
      clearInterval(id);
    };
  }, [enabled, paused]);

  return state;
}
