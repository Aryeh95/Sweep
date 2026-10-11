// Poller for NEXRAD Level III storm tracks (STI / product 58).
//
// The server does the work — bucket listing, Level III decode, azimuth/
// range → lat/lon — so this only keeps the result fresh and hands the
// component a ready-to-draw list.
//
// Cadence matches the source: one product per volume scan (4-6 min), and
// the server caches for 60 s, so polling every 60 s costs at most one
// upstream fetch per minute.

import { useState, useEffect, useRef } from "react";
import axios from "axios";

const POLL_INTERVAL_MS = 60 * 1000;

/**
 * Keep the current storm-cell list for a radar site.
 *
 * @param {Object} params
 * @param {String|null} params.site 3-letter NEXRAD id, from the radar frame poller
 * @param {Boolean} params.enabled false pauses polling (toggle off / no site yet)
 * @param {Boolean} [params.paused] true suspends polling but keeps the current cells
 * @returns {{cells: Array, mesos: Array, scanTime: String|null, hail: {available: Boolean, validTime: String|null}|null, stale: Boolean}} current cells, mesocyclone features and the hail field's status
 */
export default function useStormTracks({ site, enabled, paused = false }) {
  const [state, setState] = useState({ cells: [], mesos: [], scanTime: null, hail: null, stale: false });
  // Generation of the effect run a response belongs to: bumped by every
  // run and cleanup, so a slow answer for a previous site / pin is dropped
  // (a shared `cancelled` boolean is reset by the next run and let it in).
  const genRef = useRef(0);

  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;
    if (!enabled || !site) {
      // Clear on disable so a re-enable never flashes the previous site's
      // cells before the first fetch lands.
      setState({ cells: [], mesos: [], scanTime: null, hail: null, stale: false });
      return () => { genRef.current += 1; };
    }
    if (paused) return undefined;

    const fetchTracks = () => {
      axios.get("/api/storm-tracks", { params: { site } })
        .then((res) => {
          if (genRef.current !== gen) return;
          const { cells, mesos, scanTime, hail } = res.data || {};
          setState({
            cells: Array.isArray(cells) ? cells : [],
            mesos: Array.isArray(mesos) ? mesos : [],
            scanTime: scanTime || null,
            hail: hail && typeof hail === "object" ? hail : null,
            stale: false,
          });
        })
        .catch(() => {
          if (genRef.current !== gen) return;
          // Keep the last good cells but mark them stale — a storm track
          // that silently stops updating is worse than one visibly aging.
          setState((prev) => ({ ...prev, stale: true }));
        });
    };

    fetchTracks();
    const id = setInterval(fetchTracks, POLL_INTERVAL_MS);
    return () => {
      genRef.current += 1;
      clearInterval(id);
    };
  }, [site, enabled, paused]);

  return state;
}
