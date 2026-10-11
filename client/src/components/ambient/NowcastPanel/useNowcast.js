// Poller for the nowcast card.
//
// One GET /api/radar/nowcast a minute for the pin (the server caches the
// answer for a minute per newest scan, and a new volume scan lands every
// 4–6 min, so most polls are a cache hit). The pin is quantised to ~1 km
// so map jitter does not restart the poll; the site override rides along
// as the `site` query for the app, which has no settings.json to read.

import { useState, useEffect, useRef } from "react";
import axios from "axios";

const POLL_INTERVAL_MS = 60 * 1000;
// After a failure with nothing on screen, try again sooner: a blank card
// for a full minute is the worst state the card has.
const RETRY_EMPTY_MS = 15 * 1000;
const QUANT_DEG = 0.01;

/**
 * Why a request failed, in the card's terms.
 *
 * @param {Object} err axios error
 * @returns {"busy"|"server"|"offline"}
 */
export function nowcastErrorKind(err) {
  const status = err && err.response ? err.response.status : null;
  if (status === 429) return "busy";
  if (status) return "server";
  return "offline";
}

/**
 * Keep the current nowcast for a home point.
 *
 * @param {Object} params
 * @param {Number|null} params.latitude pin
 * @param {Number|null} params.longitude pin
 * @param {String} [params.site] manual site override ("" for automatic)
 * @param {Boolean} params.enabled false stops polling and clears
 * @param {Boolean} [params.paused] true suspends polling but keeps the last answer
 * @returns {{data: Object|null, fetchedAt: Number|null, stale: Boolean, loading: Boolean, error: String|null}}
 */
export default function useNowcast({ latitude, longitude, site = "", enabled, paused = false }) {
  const [state, setState] = useState({ data: null, fetchedAt: null, stale: false, loading: false, error: null });
  // Bumped by every effect run and cleanup; an answer is committed only if
  // the generation it was requested under is still current. A shared
  // `cancelled` boolean is NOT enough: the cleanup sets it, the next run
  // clears it again, and a slow answer for the OLD pin then lands as if it
  // were current (seen 2026-10-11: a Baltimore pin showing a TBW nowcast
  // — the app opens on its last position, Treasure Island, and the
  // locate button moved the pin while that request was still in flight).
  const genRef = useRef(0);
  // The pin / site the answer on screen was requested for.
  const shownKeyRef = useRef(null);
  // Whether an answer is on screen — picks the retry delay after a failure.
  const hasDataRef = useRef(false);

  const latKey = latitude != null ? Math.round(latitude / QUANT_DEG) : null;
  const lonKey = longitude != null ? Math.round(longitude / QUANT_DEG) : null;

  useEffect(() => {
    genRef.current += 1;
    const gen = genRef.current;
    if (!enabled || latKey == null || lonKey == null) {
      shownKeyRef.current = null;
      hasDataRef.current = false;
      setState({ data: null, fetchedAt: null, stale: false, loading: false, error: null });
      return () => { genRef.current += 1; };
    }
    if (paused) return () => { genRef.current += 1; };
    const lat = latKey * QUANT_DEG;
    const lon = lonKey * QUANT_DEG;
    const key = `${latKey},${lonKey},${site}`;
    // Same place (a pause ending): keep the answer on screen while it
    // refreshes. A NEW place: never show the old place's forecast under
    // it — clear and load.
    if (shownKeyRef.current === key) {
      setState((prev) => (prev.data ? prev : { ...prev, loading: true }));
    } else {
      shownKeyRef.current = key;
      hasDataRef.current = false;
      setState({ data: null, fetchedAt: null, stale: false, loading: true, error: null });
    }

    let timer = null;
    const fetchNowcast = () => {
      const params = { lat, lon };
      if (site) params.site = site;
      axios.get("/api/radar/nowcast", { params })
        .then((res) => {
          if (genRef.current !== gen) return;
          hasDataRef.current = Boolean(res.data);
          setState({ data: res.data || null, fetchedAt: Date.now(), stale: false, loading: false, error: null });
          timer = setTimeout(fetchNowcast, POLL_INTERVAL_MS);
        })
        .catch((err) => {
          if (genRef.current !== gen) return;
          // Keep the last answer, flagged: a stale nowcast is still more
          // useful than none, as long as it says so. With nothing on
          // screen, say why and retry sooner.
          setState((prev) => ({ ...prev, stale: true, loading: false, error: nowcastErrorKind(err) }));
          timer = setTimeout(fetchNowcast, hasDataRef.current ? POLL_INTERVAL_MS : RETRY_EMPTY_MS);
        });
    };

    fetchNowcast();
    return () => {
      genRef.current += 1;
      clearTimeout(timer);
    };
  }, [enabled, paused, latKey, lonKey, site]);

  return state;
}
