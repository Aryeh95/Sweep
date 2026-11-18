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
 * Normalise a raw socket peer address into a stable bucket key without
 * pulling in Express/Node-only modules (controllers imported by the Android
 * standalone bundle share this file via `createKeyedSingleFlight`).
 *
 *   - IPv4 ("203.0.113.5") passes through unchanged.
 *   - IPv4-mapped IPv6 ("::ffff:203.0.113.5") unwraps to IPv4 so dual-stack
 *     listeners share one bucket per IPv4 peer.
 *   - IPv6 collapses to its /56 prefix (matching express-rate-limit's
 *     ipKeyGenerator) so walking interface identifiers inside a /56 cannot
 *     multiply concurrency slots.
 *
 * @param {String} [rawPeer]
 * @returns {String}
 */
function normalizePeerKey(rawPeer) {
  if (!rawPeer || typeof rawPeer !== "string") return "unknown-peer";
  const clean = rawPeer.trim().toLowerCase().replace(/%.*$/, "");
  if (!clean) return "unknown-peer";
  const v4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(clean);
  if (v4Mapped) return v4Mapped[1];
  if (!clean.includes(":")) return clean;
  // Expand IPv6 `::` and mask to /56 (first 3 hextets + high byte of 4th).
  const halves = clean.split("::");
  if (halves.length > 2) return clean;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - left.length - right.length;
  if (fill < 0) return clean;
  const groups = [...left, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...right];
  if (groups.length !== 8) return clean;
  const nums = groups.map((g) => parseInt(g || "0", 16));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 0xffff)) return clean;
  const g3 = (nums[3] & 0xff00).toString(16);
  return `${nums[0].toString(16)}:${nums[1].toString(16)}:${nums[2].toString(16)}:${g3}::/56`;
}

/**
 * Create a per-peer concurrency guard middleware: rejects (429) a request
 * when the originating remote peer already has `max` requests in flight on
 * this guard, bounding the instantaneous outbound amplification one peer can
 * drive on a fan-out endpoint. The local kiosk (`req.isLocal`) is exempt. The
 * in-flight count releases when the handler finishes sending its response
 * (NOT on an early client disconnect, which does not stop in-flight outbound
 * fan-out), with a safety timeout in case a response never settles.
 *
 * @param {Object} [opts]
 * @param {Number} [opts.max] max concurrent in-flight requests per remote peer
 * @param {String} [opts.reason] machine-readable reason in the 429 body
 * @param {String} [opts.message] human-readable message in the 429 body
 * @param {Function} [opts.keyGenerator] optional `(req) => string` peer keyer
 * @param {Number} [opts.safetyTimeoutMs] fallback auto-release timeout (default 60 s)
 * @returns {Function} Express middleware with an `inFlightFor(peer)` helper
 */
function createPerPeerConcurrencyGuard(opts = {}) {
  const {
    max = 2,
    reason = "too-many-concurrent",
    message = "Too many concurrent requests from this client — retry shortly.",
    keyGenerator = null,
    safetyTimeoutMs = 60_000,
  } = opts;
  const inFlight = new BoundedMap(2000); // peerKey → in-flight count
  const keyForReq = (req) => (typeof keyGenerator === "function"
    ? keyGenerator(req)
    : normalizePeerKey(req?.socket?.remoteAddress));

  function guard(req, res, next) {
    if (req.isLocal) return next(); // local kiosk is trusted + low-volume
    const peer = keyForReq(req);
    const n = inFlight.get(peer) || 0;
    if (n >= max) {
      return res.status(429).json({ error: true, reason, message });
    }
    inFlight.set(peer, n + 1);
    let released = false;
    const origEnd = typeof res.end === "function" ? res.end : null;
    const timer = setTimeout(() => release(), safetyTimeoutMs);
    timer.unref?.();
    function release() {
      if (released) return;
      released = true;
      clearTimeout(timer);
      if (origEnd && res.end !== origEnd) res.end = origEnd;
      const c = (inFlight.get(peer) || 1) - 1;
      if (c <= 0) inFlight.delete(peer);
      else inFlight.set(peer, c);
      res.removeListener("finish", release);
    }
    if (origEnd) {
      res.end = function endAndRelease(...args) {
        release();
        return origEnd.apply(this, args);
      };
    }
    res.once("finish", release);
    return next();
  }

  guard.inFlightFor = (peer) => inFlight.get(keyForReq({ socket: { remoteAddress: peer } })) || 0;
  return guard;
}

/**
 * Deduplicate concurrent async work by string key: callers arriving while
 * `key` is already in flight share the existing promise; once settled, the
 * slot is cleared so subsequent calls run fresh. Pure JS — safe in both Node
 * and the Android standalone WebView bundle.
 *
 * @returns {Function} `(key, fn) => Promise<*>` with `.run`, `.size`, `.clear`
 */
function createKeyedSingleFlight() {
  const inflight = new Map();
  function run(key, fn) {
    if (inflight.has(key)) return inflight.get(key);
    const p = Promise.resolve().then(fn).finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
    inflight.set(key, p);
    return p;
  }
  run.run = run;
  run.size = () => inflight.size;
  run.clear = () => inflight.clear();
  return run;
}

module.exports = {
  createSingleFlightGuard,
  createPerPeerConcurrencyGuard,
  createKeyedSingleFlight,
  normalizePeerKey,
};
