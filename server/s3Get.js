// GET from the public NOAA / Unidata S3 buckets, with one retry on a
// transient network failure.
//
// Kiosk reports 2026-11-14/15: "read ECONNRESET" on MRMS listings, and
// dual-pol classifications that existed in the bucket but did not reach the
// kiosk for 15+ minutes. The kiosk's connection to S3 drops now and then;
// one dropped connection used to fail the whole request (a frame, a
// classification, a listing) until the next poll. A single quick retry
// rides over that without hiding a real outage: a second failure is
// thrown as before.

const axios = require("axios");

const RETRY_DELAY_MS = 400;
// Connection-level failures (Node codes, and axios's browser code in the
// app's WebView) and the server-side statuses S3 documents as retryable.
const RETRY_CODES = new Set([
  "ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EPIPE", "EAI_AGAIN",
  "ENETUNREACH", "ECONNREFUSED", "ERR_NETWORK",
]);
const RETRY_STATUSES = new Set([500, 502, 503, 504]);

/**
 * Is this axios error worth one more try?
 *
 * @param {Error} err
 * @returns {Boolean}
 */
function isTransient(err) {
  if (!err) return false;
  const status = err.response && err.response.status;
  if (status) return RETRY_STATUSES.has(status);
  if (RETRY_CODES.has(err.code)) return true;
  return /socket hang up|ECONNRESET/i.test(String(err.message || ""));
}

/**
 * axios.get with one retry on a transient failure.
 *
 * @param {String} url
 * @param {Object} [config] axios config
 * @param {Object} [deps] injectable for tests: {get, delayMs}
 * @returns {Promise<Object>} axios response
 */
async function s3Get(url, config, deps = {}) {
  const get = deps.get || axios.get;
  const delayMs = deps.delayMs ?? RETRY_DELAY_MS;
  try {
    return await get(url, config);
  } catch (err) {
    if (!isTransient(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return get(url, config);
  }
}

module.exports = { s3Get, isTransient };
