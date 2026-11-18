import axios from "axios";

let inflight = null;

/**
 * Gets settings, deduplicating concurrent in-flight requests.
 *
 * @returns {Promise} resolves settings
 */
export function getSettings() {
  if (!inflight) {
    inflight = axios
      .get("/settings")
      .then((res) => res.data)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
