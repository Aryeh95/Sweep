// Service status bookkeeping (server/serviceStatus.js): recordServiceRecovery
// clears only the failure the recovering path itself recorded.

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { recordServiceCall, recordServiceRecovery, getServiceStatus } = require("../server/serviceStatus");

const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
};

test("a path's own failure is cleared when that path works again", () => {
  const s = "test-svc-own";
  quiet(() => {
    recordServiceCall(s, 500, "frame list failed: read ECONNRESET");
    recordServiceCall(s, 500, "frame list failed: read ECONNRESET");
  });
  assert.equal(getServiceStatus()[s].consecutiveFailures, 2);
  assert.equal(quiet(() => recordServiceRecovery(s, "frame list failed", "frame list recovered")), true);
  const e = getServiceStatus()[s];
  assert.equal(e.status, 200);
  assert.equal(e.consecutiveFailures, 0);
  assert.ok(e.lastSuccess);
});

test("a different failure of the same service is left alone", () => {
  const s = "test-svc-other";
  quiet(() => {
    recordServiceCall(s, 500, "reflectivity mosaic failed: bad PNG");
    recordServiceCall(s, 500, "reflectivity mosaic failed: bad PNG");
  });
  assert.equal(quiet(() => recordServiceRecovery(s, "frame list failed", "frame list recovered")), false);
  assert.equal(getServiceStatus()[s].status, 500);
  assert.equal(getServiceStatus()[s].consecutiveFailures, 2);
});

test("a healthy or never-called service records nothing (no log line per poll)", () => {
  const s = "test-svc-healthy";
  quiet(() => recordServiceCall(s, 200, "12 frames"));
  const before = getServiceStatus()[s].lastCall;
  assert.equal(recordServiceRecovery(s, "frame list failed", "frame list recovered"), false);
  assert.equal(getServiceStatus()[s].lastCall, before);
  assert.equal(recordServiceRecovery("test-svc-never", "x", "y"), false);
  assert.equal(getServiceStatus()["test-svc-never"], undefined);
});
