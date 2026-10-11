// Concurrency guard middlewares.
//
// `createSingleFlightGuard` wraps an endpoint whose handler kicks off a long,
// side-effecting, NOT-re-entrant operation — the in-app updater's `git pull` +
// `npm ci` is the motivating case: two of those running at once on the same
// checkout can corrupt node_modules / the working tree. The guard lets the
// first request through and 409s any request that arrives while one is still
// in flight, releasing when the handler sends its final response (so a
// failed run can simply be retried) — NOT when the client disconnects, since
// a disconnect does not stop the operation.
//
// `createPerPeerConcurrencyGuard` instead caps how many requests a single
// remote peer may have in flight at once on a resource-amplifying endpoint
// (e.g. `/api/nearby-alerts`, where one request fans out ~5 outbound NWS
// calls). The local kiosk is exempt; the per-peer count auto-releases on
// response settle.

const { BoundedMap } = require("./boundedCache");

/**
 * Create a single-flight guard middleware. The returned function is an
 * Express middleware; mount it on the route(s) that must not run concurrently.
 * One guard instance guards one logical operation — create a separate guard
 * per operation you want to serialise independently.
 *
 * @param {Object} [opts]
 * @param {String} [opts.reason] machine-readable reason returned in the 409 body
 * @param {String} [opts.message] human-readable message returned in the 409 body
 * @returns {Function} Express middleware with an `isBusy()` helper attached
 */
function createSingleFlightGuard(opts = {}) {
  const { reason = "in-progress", message = "Operation already in progress." } = opts;
  let busy = false;

  function guard(req, res, next) {
    if (busy) {
      return res.status(409).json({ error: true, reason, message });
    }
    busy = true;
    // Release when the HANDLER finishes — when it ends its response, which
    // the updater does only after `git pull` / `npm ci` have completed or
    // failed — never on a client disconnect. Releasing on `close` (as this
    // did until 2026-10-11) let a closed tab or a dropped connection free
    // the lock while the child processes were still running, so a retry
    // could start a second pull + install on the same checkout — the
    // corruption this guard exists to prevent (review finding). `finish`
    // stays as a second trigger; release is idempotent and detaches
    // itself, so a late event from this response can never free a LATER
    // request's lock.
    const origEnd = typeof res.end === "function" ? res.end : null;
    const release = () => {
      if (origEnd && res.end !== origEnd) res.end = origEnd;
      busy = false;
      res.removeListener("finish", release);
    };
    if (origEnd) {
      res.end = function endAndRelease(...args) {
        release();
        return origEnd.apply(this, args);
      };
    }
    res.once("finish", release);
    return next();
  }

  guard.isBusy = () => busy;
  return guard;
}

/**
 * Create a per-peer concurrency guard middleware: rejects (429) a request
 * when the originating remote peer already has `max` requests in flight on
 * this guard, bounding the instantaneous outbound amplification one peer can
 * drive on a fan-out endpoint. The local kiosk (`req.isLocal`) is exempt. The
 * in-flight count auto-releases when each response settles. The peer-keyed map
 * is a BoundedMap (OOM guard) and a peer's entry is deleted when it hits zero.
 *
 * @param {Object} [opts]
 * @param {Number} [opts.max] max concurrent in-flight requests per remote peer
 * @param {String} [opts.reason] machine-readable reason in the 429 body
 * @param {String} [opts.message] human-readable message in the 429 body
 * @returns {Function} Express middleware with an `inFlightFor(peer)` helper
 */
function createPerPeerConcurrencyGuard(opts = {}) {
  const {
    max = 2,
    reason = "too-many-concurrent",
    message = "Too many concurrent requests from this client — retry shortly.",
  } = opts;
  const inFlight = new BoundedMap(2000); // peerKey → in-flight count

  function guard(req, res, next) {
    if (req.isLocal) return next(); // local kiosk is trusted + low-volume
    const peer = req.socket?.remoteAddress || "unknown-peer";
    const n = inFlight.get(peer) || 0;
    if (n >= max) {
      return res.status(429).json({ error: true, reason, message });
    }
    inFlight.set(peer, n + 1);
    const release = () => {
      const c = (inFlight.get(peer) || 1) - 1;
      if (c <= 0) inFlight.delete(peer);
      else inFlight.set(peer, c);
      res.removeListener("finish", release);
      res.removeListener("close", release);
    };
    res.once("finish", release);
    res.once("close", release);
    return next();
  }

  guard.inFlightFor = (peer) => inFlight.get(peer) || 0;
  return guard;
}

module.exports = { createSingleFlightGuard, createPerPeerConcurrencyGuard };
