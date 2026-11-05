// Home Assistant bridge — a small, separate, read-only HTTP listener on
// the LAN that answers one question: what is the weather doing at home?
//
//   GET http://<kiosk>:8099/summary  →  homeSummary.js's flat JSON
//   GET http://<kiosk>:8099/embed    →  the radar map alone (ui/embed.js),
//                                       only with `homeAssistant.map` on
//
// Why a separate listener instead of the main server with ALLOW_REMOTE:
//   - ALLOW_REMOTE opens the WHOLE app (UI, every /api route, masked
//     settings) to the network. Home Assistant needs one JSON document.
//   - The main server is HTTPS with a self-signed CA; HA would need its
//     certificate checks turned off, and a dashboard's browser would
//     refuse to frame it. This listener is plain HTTP, which is
//     acceptable ONLY because of what it serves: public weather data,
//     nothing that writes, no keys. /summary carries no coordinates; the
//     map (a second opt-in) necessarily shows where home is, and its
//     /settings is a reduced copy — API keys masked as for any remote
//     client, saved places and this config left out. Everything else
//     is a GET whitelist (MAP_EXACT / MAP_PREFIXES / static assets)
//     forwarded to the main app as a REMOTE client, so the main server's
//     rate limits and locality gates apply unchanged. Do not widen the
//     whitelist to anything that writes, spends a key per call
//     (reverse geocoding) or runs commands (update-check).
//   - It is opt-in (Settings → Advanced → Home Assistant, stored as
//     settings.json `homeAssistant: {enabled, port}`), and off by default.
//
// Cost: each answer is cached SUMMARY_TTL_MS and computed by the same
// controllers the kiosk polls (shared caches), so HA polling every minute
// costs what the nowcast card and the lightning layer cost — the GLM
// window is ~1 MB of downloads a minute while something asks for it.

const http = require("http");
const os = require("os");
const { getSettingsData, sanitizeHomeAssistant, maskForRemote } = require("./settingsCtrl");
const { nowcastForPoint } = require("./nowcastCtrl");
const { flashesNear } = require("./glmLightningCtrl");
const { buildHomeSummary } = require("./homeSummary");
const { NEAR_FLASH_KM } = require("./nearHome");

const SUMMARY_TTL_MS = 30 * 1000;
// Per peer. HA polls once a minute; anything far past that is a mistake
// or abuse, and the cache means it could not cost upstream calls anyway.
const PEER_LIMIT_PER_MIN = 30;
const MAX_TRACKED_PEERS = 256;
// Same quantisation as the nowcast card's poller (useNowcast QUANT_DEG),
// so HA and the kiosk share one nowcast cache entry and one live-skill
// record for the same home.
const QUANT_DEG = 0.01;

// What the embedded map may fetch through this listener. Static assets
// are the client bundle's own files (one path segment, known types).
const STATIC_ASSET = /^\/[\w.-]+\.(?:js|css|woff2?|png|svg|ico|json|txt)$/;
const MAP_EXACT = new Set([
  "/api/is-local",
  "/api/sunrise-sunset",
  "/api/weather-alerts",
  "/api/nearby-alerts",
  "/api/storm-tracks",
  "/api/lightning",
]);
const MAP_PREFIXES = ["/api/radar/", "/api/satellite/ir/", "/api/tiles/"];

let server = null;
let appHandler = null;
let state = { enabled: false, map: false, port: sanitizeHomeAssistant(null).port, listening: false, error: null };
let queue = Promise.resolve();
let cached = null;
let inflight = null;
const peers = new Map();

/**
 * Compute the summary for the saved home location.
 *
 * @param {Function} [readSettings] settings reader (tests inject one)
 * @returns {Promise<Object>} summary JSON
 */
async function computeSummary(readSettings = getSettingsData) {
  const settings = await readSettings().catch(() => ({}));
  const rawLat = parseFloat(settings.startingLat);
  const rawLon = parseFloat(settings.startingLon);
  const nowMs = Date.now();
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) {
    // The kiosk has no GPS; without a saved location it frames the map
    // from an IP lookup, which is not a home to forecast for.
    return { available: false, reason: "no-home-location", updated: new Date(nowMs).toISOString() };
  }
  const lat = Math.round(rawLat / QUANT_DEG) * QUANT_DEG;
  const lon = Math.round(rawLon / QUANT_DEG) * QUANT_DEG;
  const [nowcast, lightning] = await Promise.all([
    nowcastForPoint(lat, lon, "").catch(() => null),
    flashesNear(lat, lon, NEAR_FLASH_KM).catch(() => null),
  ]);
  return buildHomeSummary({ nowcast, lightning, home: { lat, lon }, nowMs });
}

/**
 * The cached summary; one computation in flight at a time.
 *
 * @returns {Promise<Object>}
 */
async function currentSummary() {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (!inflight) {
    inflight = computeSummary()
      .then((value) => {
        cached = { value, expires: Date.now() + SUMMARY_TTL_MS };
        return value;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/**
 * Fixed-window per-peer limit.
 *
 * @param {String} peer socket address
 * @param {Number} nowMs
 * @returns {Boolean} true when the request may proceed
 */
function allowPeer(peer, nowMs) {
  const minute = Math.floor(nowMs / 60000);
  let entry = peers.get(peer);
  if (!entry || entry.minute !== minute) {
    if (!entry && peers.size >= MAX_TRACKED_PEERS) {
      for (const [k, v] of peers) if (v.minute !== minute) peers.delete(k);
      if (peers.size >= MAX_TRACKED_PEERS) return false;
    }
    entry = { minute, count: 0 };
    peers.set(peer, entry);
  }
  entry.count += 1;
  return entry.count <= PEER_LIMIT_PER_MIN;
}

/**
 * Write a JSON response.
 *
 * @param {http.ServerResponse} res
 * @param {Number} status
 * @param {Object} body
 * @param {Boolean} [headOnly]
 */
function send(res, status, body, headOnly = false) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(headOnly ? undefined : text);
}

/**
 * May the embedded map fetch this path through the bridge?
 *
 * @param {String} path request path, no query
 * @returns {Boolean}
 */
function isMapPath(path) {
  if (path === "/embed" || path === "/settings") return true;
  if (STATIC_ASSET.test(path)) return true;
  if (MAP_EXACT.has(path)) return true;
  return MAP_PREFIXES.some((p) => path.startsWith(p)) && !path.includes("..");
}

/**
 * The settings document the embedded map reads: what any remote client
 * gets (API keys reduced to booleans), minus the saved places (labels
 * can be private, and this travels as plain HTTP) and this listener's
 * own config.
 *
 * @param {Object} data settings.json
 * @returns {Object}
 */
function embedSettings(data) {
  const masked = maskForRemote(data);
  delete masked.favorites;
  delete masked.homeAssistant;
  return masked;
}

/**
 * Let a dashboard frame the response. The main server forbids framing
 * outright (X-Frame-Options DENY, frame-ancestors 'none'); the embed
 * exists to be framed, so on this listener both are relaxed.
 *
 * @param {http.ServerResponse} res
 */
function allowFraming(res) {
  const setHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    const n = String(name).toLowerCase();
    if (n === "x-frame-options") return res;
    if (n === "content-security-policy") {
      return setHeader(name, String(value).replace(/frame-ancestors[^;]*/i, "frame-ancestors *"));
    }
    return setHeader(name, value);
  };
}

/**
 * The listener's only handler.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function handle(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return send(res, 405, { error: "method-not-allowed" });
  }
  const [path, query = ""] = (req.url || "/").split("?");
  if (path === "/summary" || path === "/") {
    // The map's own requests are limited by the main app's limiters;
    // this budget is for the summary alone.
    if (!allowPeer(req.socket.remoteAddress || "unknown", Date.now())) {
      return send(res, 429, { error: "too-many-requests" });
    }
    return currentSummary()
      .then((body) => send(res, 200, body, req.method === "HEAD"))
      .catch(() => send(res, 503, { available: false, reason: "summary-failed" }));
  }
  if (state.map && appHandler && isMapPath(path)) {
    if (path === "/settings") {
      return getSettingsData()
        .then((data) => send(res, 200, embedSettings(data), req.method === "HEAD"))
        .catch(() => send(res, 404, { error: "no-settings" }));
    }
    allowFraming(res);
    // The client is the main bundle; it enters embed mode from the
    // /embed path in the browser's address, so the server only needs
    // to hand it the page at "/".
    if (path === "/embed") req.url = query ? `/?${query}` : "/";
    return appHandler(req, res);
  }
  return send(res, 404, { error: "not-found", try: state.map ? ["/summary", "/embed"] : "/summary" });
}

/**
 * The main Express app, which serves the embedded map's files and data.
 *
 * @param {Function} handler (req, res) request listener
 */
function setAppHandler(handler) {
  appHandler = handler;
}

/**
 * Start or stop the listener to match a config. Calls are queued, so two
 * settings writes in a row can never race each other's listen / close.
 *
 * @param {*} config settings.json `homeAssistant` value
 * @returns {Promise<Object>} status()
 */
function configure(config) {
  const want = sanitizeHomeAssistant(config);
  queue = queue.then(async () => {
    if (server && (!want.enabled || want.port !== state.port)) {
      const old = server;
      server = null;
      await new Promise((resolve) => old.close(() => resolve()));
      state = { ...state, listening: false };
      console.log(`[home-assistant] stopped listening on port ${state.port}`);
    }
    state = { ...state, enabled: want.enabled, map: want.map, port: want.port };
    if (!want.enabled) {
      state = { ...state, error: null };
      return;
    }
    if (server) return;
    await new Promise((resolve) => {
      const s = http.createServer(handle);
      s.on("error", (err) => {
        // EADDRINUSE / EACCES: report it in Settings rather than crash.
        state = { ...state, listening: false, error: err.code || err.message };
        console.error(`[home-assistant] cannot listen on port ${want.port}: ${err.code || err.message}`);
        if (server === s) server = null;
        resolve();
      });
      s.listen(want.port, "0.0.0.0", () => {
        server = s;
        state = { ...state, listening: true, error: null };
        console.log(`[home-assistant] serving /summary on port ${want.port}`);
        resolve();
      });
    });
  }).catch((err) => {
    console.error(`[home-assistant] configure failed: ${err.message}`);
  });
  return queue.then(status);
}

/**
 * Re-read settings.json and apply its `homeAssistant` value. Called at
 * startup and after every successful settings write.
 *
 * @returns {Promise<Object>} status()
 */
function reconcileFromSettings() {
  return getSettingsData()
    .catch(() => ({}))
    .then((settings) => configure(settings.homeAssistant));
}

/**
 * Addresses Home Assistant can reach this machine on.
 *
 * @param {Number} port
 * @returns {Array<String>} summary URLs, LAN IPv4 first, then the mDNS name
 */
function lanUrls(port) {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal) urls.push(`http://${a.address}:${port}/summary`);
    }
  }
  urls.push(`http://${os.hostname()}.local:${port}/summary`);
  return urls;
}

/**
 * The bridge's state, for the Settings panel.
 *
 * @returns {{enabled: Boolean, map: Boolean, port: Number, listening: Boolean, error: String|null,
 *   urls: Array<String>, embedUrls: Array<String>}}
 */
function status() {
  const urls = state.enabled ? lanUrls(state.port) : [];
  return {
    ...state,
    urls,
    embedUrls: state.map ? urls.map((u) => u.replace(/\/summary$/, "/embed")) : [],
  };
}

/**
 * GET /api/home-assistant (localhost only) — the bridge's status.
 *
 * @param {Object} req
 * @param {Object} res
 */
function getHomeAssistantStatus(req, res) {
  return res.status(200).json(status()).end();
}

module.exports = {
  configure,
  reconcileFromSettings,
  setAppHandler,
  status,
  getHomeAssistantStatus,
  // Exported for tests.
  computeSummary,
  allowPeer,
  handle,
  isMapPath,
  embedSettings,
  PEER_LIMIT_PER_MIN,
};
