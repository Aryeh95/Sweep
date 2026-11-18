// Baseline HTTP security headers applied to every response.
//
// Set by hand rather than pulling in `helmet`: the set we need is small and
// static, and the fleet deliberately keeps a minimal dependency footprint
// (auto-pulling installs, `npm audit` clean). What each header buys:
//
//   X-Content-Type-Options: nosniff   — browsers must honour the declared
//       Content-Type instead of MIME-sniffing (Express serves correct types
//       for the bundle, JSON, and PNG tiles, so this is free hardening).
//   X-Frame-Options: DENY             — the kiosk UI must never be framed
//       (clickjacking). It renders directly; RPi Connect screen-shares the
//       on-device display, it does not iframe the app.
//   Referrer-Policy: no-referrer      — the SPA only ever calls its own
//       origin (all third-party APIs are server-proxied), so there is no
//       referrer worth sending anywhere; no-referrer matches the fleet's
//       privacy posture.
//   Content-Security-Policy: frame-ancestors 'none' — the modern anti-frame
//       control, paired with X-Frame-Options for older browsers.
//
// Deliberately NOT set:
//   - A full CSP (script-src / style-src / …). The SPA relies on runtime
//     inline styles (computed zoom / grid-template / CSS custom properties)
//     and Leaflet, so a restrictive policy would risk breaking the kiosk for
//     no real gain on a single-origin app. CSP is scoped to frame-ancestors.
//   - HSTS. The kiosk serves a self-signed cert on a loopback/LAN target and
//     keeps an :8080 HTTP fallback; pinning HTTPS would do more harm than
//     good here.

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "frame-ancestors 'none'",
};

/**
 * Express middleware that stamps the baseline security headers on every
 * response. Mounted first (before routes) so it covers static files, the
 * API, and error responses alike.
 *
 * @param {Object} req Express request (unused).
 * @param {Object} res Express response.
 * @param {Function} next
 */
function securityHeaders(req, res, next) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  next();
}

/**
 * Extract the lowercased hostname/IP literal from an HTTP `Host` header value,
 * stripping an optional `:port` suffix and unwrapping `[::1]` IPv6 brackets.
 * Returns `null` when malformed.
 *
 * @param {String} rawHost
 * @returns {String|null}
 */
function extractHostHeaderName(rawHost) {
  if (typeof rawHost !== "string") return null;
  const trimmed = rawHost.trim().toLowerCase();
  if (!trimmed || /[\s/@\\]/.test(trimmed)) return null;
  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    if (close === -1) return null;
    const rest = trimmed.slice(close + 1);
    if (rest && !/^:\d+$/.test(rest)) return null;
    return trimmed.slice(1, close);
  }
  const firstColon = trimmed.indexOf(":");
  const lastColon = trimmed.lastIndexOf(":");
  if (firstColon !== -1 && firstColon === lastColon) {
    if (!/^:\d+$/.test(trimmed.slice(firstColon))) return null;
    return trimmed.slice(0, firstColon);
  }
  return trimmed;
}

/**
 * Browser cross-origin request detector (CSRF / cross-origin localhost read
 * defence). A malicious web page open in the Pi's or an SSH-tunnel user's
 * browser sends `Sec-Fetch-Site: cross-site` (or `same-site` across ports)
 * and/or an `Origin` header naming the attacker's origin, even when the TCP
 * socket peer is 127.0.0.1. Non-browser tools (`curl`, scripts) send neither
 * header and continue working over loopback / SSH tunnels unchanged.
 *
 * @param {Object} req Express request
 * @returns {Boolean} true when browser metadata marks the request cross-origin
 */
function isCrossOriginBrowserRequest(req) {
  const headers = (req && req.headers) || {};
  const secFetchSite = headers["sec-fetch-site"];
  if (typeof secFetchSite === "string" && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return true;
  }
  const origin = headers.origin;
  if (origin !== undefined) {
    if (typeof origin !== "string" || origin === "null" || !headers.host) return true;
    try {
      const originUrl = new URL(origin);
      const expectedHost = new URL(`${originUrl.protocol}//${headers.host}`).host;
      if (originUrl.host.toLowerCase() !== expectedHost.toLowerCase()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Extract the exact Subject Common Name (`CN`) from `openssl x509 -subject`
 * output (supports both OpenSSL 3 `subject=CN = Foo` and LibreSSL
 * `subject= /CN=Foo`).
 *
 * @param {String} output
 * @returns {String|null}
 */
function parseCertSubjectCN(output) {
  if (typeof output !== "string") return null;
  const subjectLine = output.trim().replace(/^subject=\s*/i, "");
  const m = subjectLine.match(/(?:^|[/,])\s*CN\s*=\s*([^,/\r\n]+?)\s*(?:$|[,/\r\n])/);
  return m ? m[1].trim() : null;
}

/**
 * Parse exact `DNS:name` and `IP:addr` tokens from `openssl x509 -ext
 * subjectAltName` output so `IP:192.168.1.100` never substring-matches
 * `IP:192.168.1.1`.
 *
 * @param {String} output
 * @returns {Set<String>} uppercased prefix + lowercased value (`"IP:192.168.1.1"`)
 */
function parseCertSanEntries(output) {
  const entries = new Set();
  if (typeof output !== "string") return entries;
  for (const token of output.split(/[,\r\n]+/)) {
    const t = token.trim().replace(/^IP Address:/i, "IP:");
    if (/^(DNS|IP):/i.test(t)) {
      const idx = t.indexOf(":");
      entries.add(`${t.slice(0, idx).toUpperCase()}:${t.slice(idx + 1).trim().toLowerCase()}`);
    }
  }
  return entries;
}

module.exports = {
  securityHeaders,
  SECURITY_HEADERS,
  extractHostHeaderName,
  isCrossOriginBrowserRequest,
  parseCertSubjectCN,
  parseCertSanEntries,
};
