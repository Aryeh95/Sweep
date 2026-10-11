// Rate-limit key derivation — socket peer, never req.ip.
//
// express-rate-limit defaults to keying buckets on req.ip. Under
// `trust proxy` (set when ALLOW_REMOTE=true) req.ip honours the client-
// supplied X-Forwarded-For header, so a single remote/LAN client can mint
// unlimited distinct rate-limit buckets by rotating that header — fully
// bypassing the limiter (and, on the paid /api/weather-summary path, the
// only brake on Anthropic spend). This is the rate-limit-layer companion
// to the e4a9e72 locality fix: the bucket key is derived from the raw TCP
// socket peer (`req.socket.remoteAddress`), which the kernel sets and an
// HTTP header cannot forge.
//
// ipKeyGenerator is express-rate-limit's own normaliser — it collapses an
// IPv6 address to its /56 subnet (so a client can't sidestep the limit by
// walking addresses inside its own block) and passes IPv4 through. We feed
// it the socket peer instead of req.ip.

const { ipKeyGenerator } = require("express-rate-limit");

/**
 * Build a rate-limit bucket key from the connection's socket peer.
 * Falls back to a constant string when the socket address is somehow
 * unavailable, so such requests share one bucket rather than each getting
 * an unlimited fresh one.
 *
 * @param {Object} req Express request.
 * @returns {String} stable, unspoofable bucket key
 */
function socketPeerKeyGenerator(req) {
  const peer = req?.socket?.remoteAddress;
  if (!peer) return "unknown-peer";
  return ipKeyGenerator(peer);
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * express-rate-limit `skip`: exempt the device's own kiosk (a loopback
 * socket peer — again never req.ip, which X-Forwarded-For can forge).
 *
 * The limiters exist to brake remote/LAN clients. The kiosk itself
 * outgrew 120 requests a minute once the loop warm-up (radials, IR and
 * mosaic frames), the pollers and the nowcast card's own lightning poll
 * all ran together — the likeliest reason the card read "Nowcast
 * unavailable" under a live storm line (kiosk photo, 2026-10-11) while
 * the same request answered fine from outside. An SSH tunnel also arrives from loopback and is exempt
 * too — it is the owner by construction.
 *
 * @param {Object} req Express request.
 * @returns {Boolean} true when the request should not be counted
 */
function skipLoopbackPeer(req) {
  return LOOPBACK.has(req?.socket?.remoteAddress);
}

module.exports = { socketPeerKeyGenerator, skipLoopbackPeer };
