// Regression tests for dismissed-alert stale pruning
// (client/src/ui/dismissedAlerts.js).
//
// Run: `npm test` (Node's built-in `node --test` runner).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../client/src/ui/dismissedAlerts.js");

test("purgeStale expires future-dated alerts once their expiry passes", async () => {
  const { purgeStale } = await load();
  const t0 = Date.parse("2026-11-26T12:00:00Z");
  const store = {
    active: {
      ts: t0,
      severity: "severe",
      expiresAt: new Date(t0 + 60 * 60 * 1000).toISOString(),
    },
  };

  assert.deepEqual(Object.keys(purgeStale(store, t0 + 30 * 60 * 1000)), ["active"]);
  assert.deepEqual(Object.keys(purgeStale(store, t0 + 61 * 60 * 1000)), []);
});

test("purgeStale keeps an already-expired alert dismissed until AUTO_RESURFACE_MS instead of self-deleting immediately", async () => {
  const { purgeStale, AUTO_RESURFACE_MS } = await load();
  const t0 = Date.parse("2026-11-26T12:00:00Z");
  // Regression for the Baltimore Wind Advisory bug: upstream sent expiresAt
  // 23 h in the past, so writeStore's synchronous purgeStale deleted the entry
  // on click and left the alert undismissable.
  const store = {
    stuckPastExpiry: {
      ts: t0,
      severity: "moderate",
      expiresAt: new Date(t0 - 23 * 60 * 60 * 1000).toISOString(),
    },
  };

  assert.deepEqual(Object.keys(purgeStale(store, t0)), ["stuckPastExpiry"]);
  assert.deepEqual(Object.keys(purgeStale(store, t0 + 60 * 60 * 1000)), ["stuckPastExpiry"]);
  assert.deepEqual(Object.keys(purgeStale(store, t0 + AUTO_RESURFACE_MS)), ["stuckPastExpiry"]);
  assert.deepEqual(Object.keys(purgeStale(store, t0 + AUTO_RESURFACE_MS + 1)), []);
});

test("purgeStale honours AUTO_RESURFACE_MS when expiresAt is absent or invalid", async () => {
  const { purgeStale, AUTO_RESURFACE_MS } = await load();
  const t0 = Date.parse("2026-11-26T12:00:00Z");
  const store = {
    undated: { ts: t0, severity: "minor", expiresAt: null },
    badDate: { ts: t0, severity: "minor", expiresAt: "invalid" },
  };

  assert.deepEqual(Object.keys(purgeStale(store, t0 + 60 * 60 * 1000)), ["undated", "badDate"]);
  assert.deepEqual(Object.keys(purgeStale(store, t0 + AUTO_RESURFACE_MS + 1)), []);
});
