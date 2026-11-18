// Poller for the GOES GLM lightning overlay.
//
// Polls /api/lightning once a minute (the server caches responses for one
// 20-second product cadence and keeps a rolling per-file cache, so a poll
// costs at most a couple of ~320 KB upstream fetches). Ages arrive baked
// into each flash as seconds-at-generation; the overlay adds the time
// since the fetch when fading, so markers keep aging between polls.

import { useState, useEffect } from "react";
import axios from "axios";

const POLL_INTERVAL_MS = 60 * 1000;

// Matches the raw-radial display radius — lightning beyond the rendered
// radar disc would float over nothing identifiable.
const RADIUS_KM = 300;

const EMPTY_STATE = { flashes: [], count: null, fetchedAt: null, dataEpoch: null, stale: false };

// Shared per-coordinate poller so simultaneous consumers (WeatherMap and
// NowcastPanel) share one 60 s timer and one response instead of firing
// duplicate /api/lightning polls.
const SHARED_POLLERS = new Map();

/**
 * Obtain or create the shared poller entry for a quantised coordinate key.
 *
 * @param {String} key `${latKey},${lonKey}`
 * @param {Number} lat quantised latitude
 * @param {Number} lon quantised longitude
 * @returns {Object} shared entry
 */
function getPollerEntry(key, lat, lon) {
  let entry = SHARED_POLLERS.get(key);
  if (entry) return entry;

  entry = {
    key,
    lat,
    lon,
    state: EMPTY_STATE,
    listeners: new Set(),
    activeSubs: new Set(),
    timer: null,
    inflight: false,
    gen: 0,
    fetch() {
      if (entry.inflight) return;
      entry.inflight = true;
      const reqGen = entry.gen;
      axios.get("/api/lightning", { params: { lat: entry.lat, lon: entry.lon, radiusKm: RADIUS_KM } })
        .then((res) => {
          entry.inflight = false;
          if (entry.gen !== reqGen || entry.listeners.size === 0) {
            if (entry.listeners.size === 0) SHARED_POLLERS.delete(key);
            return;
          }
          const d = res.data || {};
          const flashes = Array.isArray(d.flashes) ? d.flashes : [];
          const fetchedAt = Date.now();
          let newestAge = Infinity;
          for (const [, , age] of flashes) {
            if (Number.isFinite(age) && age < newestAge) newestAge = age;
          }
          const generated = Date.parse(d.generatedAt);
          const dataEpoch = Number.isFinite(newestAge)
            ? fetchedAt - newestAge * 1000
            : (Number.isFinite(generated) ? generated : fetchedAt);
          entry.state = {
            flashes,
            count: Number.isFinite(d.count) ? d.count : null,
            fetchedAt,
            dataEpoch,
            stale: false,
          };
          for (const fn of entry.listeners) fn(entry.state);
        })
        .catch(() => {
          entry.inflight = false;
          if (entry.gen !== reqGen || entry.listeners.size === 0) {
            if (entry.listeners.size === 0) SHARED_POLLERS.delete(key);
            return;
          }
          // Keep the last flashes — they age out visually on their own,
          // which is the honest failure mode for this overlay.
          entry.state = { ...entry.state, stale: true };
          for (const fn of entry.listeners) fn(entry.state);
        });
    },
  };
  SHARED_POLLERS.set(key, entry);
  return entry;
}

/**
 * Keep the current lightning-flash list for a map centre.
 *
 * @param {Object} params
 * @param {Number|null} params.latitude map centre
 * @param {Number|null} params.longitude map centre
 * @param {Boolean} params.enabled false pauses polling and clears
 * @param {Boolean} [params.paused] true suspends polling but keeps the current flashes
 * @returns {{flashes: Array, count: Number|null, fetchedAt: Number|null, dataEpoch: Number|null, stale: Boolean}} `dataEpoch` is the time of the newest flash (or of the window itself when it holds none)
 */
export default function useLightning({ latitude, longitude, enabled, paused = false }) {
  const [state, setState] = useState(EMPTY_STATE);

  // Quantised coords so map jitter doesn't restart the poller — same
  // pattern as useIemRadarFrames.
  const latKey = latitude != null ? Math.round(latitude / 0.05) : null;
  const lonKey = longitude != null ? Math.round(longitude / 0.05) : null;

  useEffect(() => {
    if (!enabled || latKey == null || lonKey == null) {
      setState(EMPTY_STATE);
      return undefined;
    }
    const key = `${latKey},${lonKey}`;
    const entry = getPollerEntry(key, latKey * 0.05, lonKey * 0.05);
    if (entry.state.fetchedAt !== null) {
      setState(entry.state);
    }
    if (paused) return undefined;

    const sub = Symbol("lightning-sub");
    entry.listeners.add(setState);
    entry.activeSubs.add(sub);

    const fresh = entry.state.fetchedAt !== null
      && Date.now() - entry.state.fetchedAt < POLL_INTERVAL_MS
      && !entry.state.stale;
    if (!entry.timer) {
      if (!fresh) entry.fetch();
      entry.timer = setInterval(() => entry.fetch(), POLL_INTERVAL_MS);
    } else if (!fresh && !entry.inflight) {
      entry.fetch();
    }

    return () => {
      entry.activeSubs.delete(sub);
      entry.listeners.delete(setState);
      if (entry.activeSubs.size === 0 && entry.timer) {
        clearInterval(entry.timer);
        entry.timer = null;
      }
      if (entry.listeners.size === 0 && !entry.inflight) {
        entry.gen += 1;
        SHARED_POLLERS.delete(key);
      }
    };
  }, [enabled, paused, latKey, lonKey]);

  return state;
}
