// Regression tests for the baseline HTTP security-header middleware
// (server/securityHeaders.js). These lock down that every response carries
// the anti-sniff / anti-frame / referrer / frame-ancestors headers and that
// the middleware always continues the chain.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  securityHeaders,
  SECURITY_HEADERS,
  extractHostHeaderName,
  isCrossOriginBrowserRequest,
  parseCertSubjectCN,
  parseCertSanEntries,
} = require("../server/securityHeaders");
const { sunriseSunset } = require("../server/proxyCtrl");
const { skipLoopbackPeer } = require("../server/rateLimitKey");
const { createKeyedSingleFlight, createPerPeerConcurrencyGuard } = require("../server/singleFlight");

// Minimal Express res stand-in that records setHeader calls.
function fakeRes() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name] = value;
    },
  };
}

test("securityHeaders: stamps every header in SECURITY_HEADERS and calls next()", () => {
  const res = fakeRes();
  let nextCalled = false;
  securityHeaders({}, res, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled, "next() must be called so the chain continues");
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(res.headers[name], value, `${name} must be set to ${value}`);
  }
});

test("securityHeaders: sets the four expected hardening headers", () => {
  // Lock the exact contract so a stray edit (e.g. weakening X-Frame-Options
  // to SAMEORIGIN, or dropping nosniff) trips a test.
  assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
  assert.equal(SECURITY_HEADERS["X-Frame-Options"], "DENY");
  assert.equal(SECURITY_HEADERS["Referrer-Policy"], "no-referrer");
  assert.equal(SECURITY_HEADERS["Content-Security-Policy"], "frame-ancestors 'none'");
});

test("securityHeaders: does not set HSTS (self-signed cert + HTTP fallback target)", () => {
  // Deliberately absent — pinning HTTPS would harm the self-signed kiosk.
  const res = fakeRes();
  securityHeaders({}, res, () => {});
  assert.ok(!("Strict-Transport-Security" in res.headers));
});

test("extractHostHeaderName: parses IPv4, hostname, and bracketed IPv6 with or without port", () => {
  assert.equal(extractHostHeaderName("localhost:8443"), "localhost");
  assert.equal(extractHostHeaderName("127.0.0.1:8080"), "127.0.0.1");
  assert.equal(extractHostHeaderName("[::1]:8443"), "::1");
  assert.equal(extractHostHeaderName("Sweep.local"), "sweep.local");
  assert.equal(extractHostHeaderName("attacker.example:8080"), "attacker.example");
  assert.equal(extractHostHeaderName("localhost:notaport"), null);
  assert.equal(extractHostHeaderName("evil@localhost:8443"), null);
  assert.equal(extractHostHeaderName(""), null);
});

test("isCrossOriginBrowserRequest: blocks cross-site Sec-Fetch-Site and mismatched Origin, allows curl and same-origin", () => {
  // CLI / curl: neither Origin nor Sec-Fetch-Site present -> allowed
  assert.equal(isCrossOriginBrowserRequest({ headers: { host: "localhost:8443" } }), false);
  // Direct top-level navigation -> Sec-Fetch-Site: none -> allowed
  assert.equal(isCrossOriginBrowserRequest({
    headers: { host: "localhost:8443", "sec-fetch-site": "none" },
  }), false);
  // Same-origin XHR/fetch -> allowed
  assert.equal(isCrossOriginBrowserRequest({
    headers: { host: "localhost:8443", origin: "https://localhost:8443", "sec-fetch-site": "same-origin" },
  }), false);
  // Cross-site form POST or no-cors fetch -> blocked
  assert.equal(isCrossOriginBrowserRequest({
    headers: { host: "localhost:8443", origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  }), true);
  // Cross-port localhost (same-site, different port) -> blocked
  assert.equal(isCrossOriginBrowserRequest({
    headers: { host: "localhost:8443", origin: "http://localhost:3000", "sec-fetch-site": "same-site" },
  }), true);
  // Sandboxed iframe Origin: null -> blocked
  assert.equal(isCrossOriginBrowserRequest({
    headers: { host: "localhost:8443", origin: "null" },
  }), true);
});

test("parseCertSubjectCN & parseCertSanEntries: exact token matching (no IP/CN prefix collisions)", () => {
  assert.equal(parseCertSubjectCN("subject=CN = Sweep - kiosk\n"), "Sweep - kiosk");
  assert.equal(parseCertSubjectCN("subject= /CN=Sweep\n"), "Sweep");
  assert.notEqual(parseCertSubjectCN("subject=CN = Sweep - oldhost\n"), "Sweep");

  const san = parseCertSanEntries(
    "X509v3 Subject Alternative Name:\n    DNS:localhost, IP Address:127.0.0.1, IP Address:192.168.1.100\n"
  );
  assert.equal(san.has("IP:192.168.1.100"), true);
  assert.equal(san.has("IP:192.168.1.1"), false, "192.168.1.100 must NOT satisfy 192.168.1.1");
  assert.equal(san.has("DNS:localhost"), true);
});

test("skipLoopbackPeer: haBridge loopback requests are never exempt from rate limiting", () => {
  assert.equal(skipLoopbackPeer({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(skipLoopbackPeer({ socket: { remoteAddress: "127.0.0.1" }, fromHaBridge: true }), false);
});

test("createKeyedSingleFlight & per-peer IPv6 normalization / early-close hold", async () => {
  const sf = createKeyedSingleFlight();
  let runs = 0;
  const [a, b] = await Promise.all([
    sf.run("k", async () => { runs += 1; await new Promise((r) => setTimeout(r, 10)); return 42; }),
    sf.run("k", async () => { runs += 1; return 99; }),
  ]);
  assert.equal(runs, 1);
  assert.equal(a, 42);
  assert.equal(b, 42);

  const { EventEmitter } = require("node:events");
  const guard = createPerPeerConcurrencyGuard({ max: 1 });
  const res1 = new EventEmitter();
  res1.status = () => res1;
  res1.json = () => res1;
  res1.end = () => res1;
  // IPv6 addresses in the same /56 share one concurrency bucket
  guard({ socket: { remoteAddress: "2001:db8:abcd:1200::1" }, isLocal: false }, res1, () => {});
  res1.emit("close"); // premature client socket close while upstream work still runs
  let secondAllowed = false;
  const res2 = new EventEmitter();
  res2.status = (c) => { res2.statusCode = c; return res2; };
  res2.json = () => res2;
  guard({ socket: { remoteAddress: "2001:db8:abcd:12ff::9" }, isLocal: false }, res2, () => { secondAllowed = true; });
  assert.equal(secondAllowed, false, "same /56 must share the slot and survive premature socket close");
  assert.equal(res2.statusCode, 429);
  res1.emit("finish");
  guard({ socket: { remoteAddress: "2001:db8:abcd:12ff::9" }, isLocal: false }, res2, () => { secondAllowed = true; });
  assert.equal(secondAllowed, true);
});

test("sunriseSunset: rejects impossible calendar dates with HTTP 400 instead of throwing RangeError", async () => {
  let code = 200;
  let body = null;
  const res = {
    status(c) { code = c; return res; },
    json(b) { body = b; return res; },
    end() { return res; },
  };
  await sunriseSunset({ query: { lat: "40", lon: "-75", date: "2026-99-99", tomorrow: "1" } }, res);
  assert.equal(code, 400);
  assert.equal(body, "Invalid date");
});
