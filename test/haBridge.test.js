// Home Assistant bridge (server/haBridge.js) — listener lifecycle, limits, config.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const bridge = require("../server/haBridge");
const { sanitizeHomeAssistant, __test } = require("../server/settingsCtrl");

const get = (port, path, method = "GET") => new Promise((resolve, reject) => {
  const req = http.request({ host: "127.0.0.1", port, path, method }, (res) => {
    let body = "";
    res.on("data", (c) => { body += c; });
    res.on("end", () => resolve({ status: res.statusCode, body }));
  });
  req.on("error", reject);
  req.end();
});

test("config is off unless enabled is exactly true; bad ports fall back to 8099", () => {
  assert.deepEqual(sanitizeHomeAssistant(null), { enabled: false, port: 8099 });
  assert.deepEqual(sanitizeHomeAssistant({ enabled: "true", port: 9000 }), { enabled: false, port: 9000 });
  assert.deepEqual(sanitizeHomeAssistant({ enabled: true, port: 80 }), { enabled: true, port: 8099 });
  assert.deepEqual(sanitizeHomeAssistant({ enabled: true, port: 8443 }), { enabled: true, port: 8099 });
  assert.deepEqual(sanitizeHomeAssistant({ enabled: true, port: "8123" }), { enabled: true, port: 8123 });
  assert.ok(__test.ALLOWED_KEYS.has("homeAssistant"));
  assert.deepEqual(__test.sanitizeValue("homeAssistant", { enabled: true, port: 1 }), { enabled: true, port: 8099 });
});

test("per-peer limit allows a minute's worth of polls, then refuses", () => {
  const t = Date.parse("2026-11-05T20:00:10Z");
  for (let i = 0; i < bridge.PEER_LIMIT_PER_MIN; i += 1) assert.equal(bridge.allowPeer("10.0.0.9", t), true);
  assert.equal(bridge.allowPeer("10.0.0.9", t), false);
  assert.equal(bridge.allowPeer("10.0.0.10", t), true, "another peer has its own budget");
  assert.equal(bridge.allowPeer("10.0.0.9", t + 60000), true, "a new minute resets it");
});

test("without a saved home location the summary says so instead of guessing", async () => {
  const out = await bridge.computeSummary(async () => ({}));
  assert.equal(out.available, false);
  assert.equal(out.reason, "no-home-location");
});

test("listener starts, serves only /summary, moves port, stops, and reports a taken port", async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  let st = await bridge.configure({ enabled: true, port });
  assert.equal(st.listening, true);
  assert.ok(st.urls.some((u) => u.endsWith(`:${port}/summary`)));
  assert.equal((await get(port, "/settings")).status, 404);
  assert.equal((await get(port, "/summary", "POST")).status, 405);

  st = await bridge.configure({ enabled: true, port: port + 1 });
  assert.equal(st.listening, true);
  await assert.rejects(get(port, "/x"), "old port is closed");
  assert.equal((await get(port + 1, "/x")).status, 404);

  st = await bridge.configure({ enabled: false, port: port + 1 });
  assert.equal(st.listening, false);
  assert.deepEqual(st.urls, []);
  await assert.rejects(get(port + 1, "/x"));

  const blocker = http.createServer().listen(port + 2, "0.0.0.0");
  await new Promise((r) => blocker.once("listening", r));
  st = await bridge.configure({ enabled: true, port: port + 2 });
  assert.equal(st.listening, false);
  assert.equal(st.error, "EADDRINUSE");
  await new Promise((r) => blocker.close(r));
  st = await bridge.configure({ enabled: true, port: port + 2 });
  assert.equal(st.listening, true, "retries once the port is free");
  await bridge.configure({ enabled: false });
});
