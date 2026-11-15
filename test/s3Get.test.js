// One retry on a transient S3 failure (server/s3Get.js).

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { s3Get, isTransient } = require("../server/s3Get");

const fail = (code, status) => Object.assign(new Error(code || `HTTP ${status}`), { code, response: status ? { status } : undefined });

test("a dropped connection is retried once and the retry's answer returned", async () => {
  let calls = 0;
  const get = async () => { calls += 1; if (calls === 1) throw fail("ECONNRESET"); return { data: "ok" }; };
  const res = await s3Get("u", {}, { get, delayMs: 0 });
  assert.equal(res.data, "ok");
  assert.equal(calls, 2);
});

test("a second failure is thrown, not retried again", async () => {
  let calls = 0;
  const get = async () => { calls += 1; throw fail("ECONNRESET"); };
  await assert.rejects(s3Get("u", {}, { get, delayMs: 0 }), /ECONNRESET/);
  assert.equal(calls, 2);
});

test("permanent failures are not retried", async () => {
  let calls = 0;
  const get = async () => { calls += 1; throw fail(undefined, 404); };
  await assert.rejects(s3Get("u", {}, { get, delayMs: 0 }));
  assert.equal(calls, 1);
});

test("what counts as transient", () => {
  for (const c of ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EAI_AGAIN", "ERR_NETWORK"]) assert.equal(isTransient(fail(c)), true, c);
  for (const s of [500, 502, 503, 504]) assert.equal(isTransient(fail(undefined, s)), true, String(s));
  assert.equal(isTransient(new Error("socket hang up")), true);
  for (const s of [400, 403, 404]) assert.equal(isTransient(fail(undefined, s)), false, String(s));
  assert.equal(isTransient(new Error("product carried no radial packet")), false);
});
