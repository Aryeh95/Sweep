// Regression tests for the settings controller's two security-critical
// pure helpers: the input whitelist (`sanitizeSettings`) and the remote-
// client masking layer (`maskForRemote`).
//
// Why these are worth dedicated coverage:
//   - sanitizeSettings is the gate that prevents an attacker (or a buggy
//     client) from writing arbitrary keys into settings.json on a PATCH
//     or PUT. Drop the gate by accident and any caller can plant fields
//     the server will then read back as settings.
//   - maskForRemote is the gate that prevents secrets (the API keys, and
//     any sub-object listed in REMOTE_HIDDEN_KEYS) from leaving the server
//     when a remote client polls GET /settings. A hidden subtree must be
//     entirely absent from the remote response, not merely null-ed or
//     boolean-ed.
//   - The keys of removed features (Tomorrow.io, Anthropic, AirNow, OpenAQ,
//     the Homebridge indoorTemperature block) must be REJECTED, not merely
//     unused: while they were still allow-listed a stale settings.json
//     looked configured for features that no longer exist.
//
// Both helpers are pure and exported via the controller's `__test`
// surface — same pattern as radarAnalyzerCtrl and aiSummaryCtrl.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { __test } = require("../server/settingsCtrl");
const { sanitizeSettings, maskForRemote, ensureSecurePermissions, writeSettingsFile, sweepOrphanSettingsTmp, FILE_MODE, ALLOWED_KEYS, API_KEY_FIELDS, REMOTE_HIDDEN_KEYS } = __test;

// === sanitizeSettings: the input whitelist ===

test("sanitizeSettings: passes through every allowed key", () => {
  const input = {
    mapApiKey: "def",
    reverseGeoApiKey: "ghi",
    startingLat: 45.5,
    startingLon: -73.5,
    radarSite: "LWX",
    favorites: [],
    advanced: { display: { radarPalette: "scope" } },
  };
  const out = sanitizeSettings(input);
  for (const k of Object.keys(input)) {
    assert.ok(k in out, `expected allowed key "${k}" to be preserved`);
  }
  assert.equal(Object.keys(out).length, Object.keys(input).length);
});

test("sanitizeSettings: radarSite is coerced to its 3-letter IEM form or blank", () => {
  // Accepts IEM (LWX) and ICAO (KLWX) spellings in any case; anything
  // else becomes "" (automatic) so a typo can never pin the layer on a
  // site that does not exist.
  assert.equal(sanitizeSettings({ radarSite: "lwx" }).radarSite, "LWX");
  assert.equal(sanitizeSettings({ radarSite: " KLWX " }).radarSite, "LWX");
  assert.equal(sanitizeSettings({ radarSite: "" }).radarSite, "");
  assert.equal(sanitizeSettings({ radarSite: "LW" }).radarSite, "");
  assert.equal(sanitizeSettings({ radarSite: "L-WX" }).radarSite, "");
  assert.equal(sanitizeSettings({ radarSite: 42 }).radarSite, "");
});

test("sanitizeSettings: keys of removed features are dropped, not stored", () => {
  // Tomorrow.io, the Claude summary, air quality and the Homebridge indoor
  // sensor all went in the August 2026 radar rework. Their keys used to be
  // allow-listed "for backward compatibility"; that only let an old
  // settings.json keep looking configured.
  const out = sanitizeSettings({
    mapApiKey: "kept",
    weatherApiKey: "tomorrow-io",
    anthropicApiKey: "claude",
    airNowApiKey: "airnow",
    openAqApiKey: "openaq",
    indoorTemperature: { enabled: true, homebridgeUrl: "http://homebridge.local:8581", password: "p" },
  });
  assert.deepEqual(out, { mapApiKey: "kept" });
});

test("sanitizeSettings: drops unknown keys silently", () => {
  const out = sanitizeSettings({
    mapApiKey: "kept",
    __proto__pollution: "evil",
    rogueKey: 123,
    "../../../etc/passwd": "nope",
  });
  assert.equal(out.mapApiKey, "kept");
  assert.ok(!("__proto__pollution" in out));
  assert.ok(!("rogueKey" in out));
  assert.ok(!("../../../etc/passwd" in out));
});

test("sanitizeSettings: null / undefined / non-object input → {}", () => {
  assert.deepEqual(sanitizeSettings(null), {});
  assert.deepEqual(sanitizeSettings(undefined), {});
  assert.deepEqual(sanitizeSettings(42), {});
  assert.deepEqual(sanitizeSettings("string"), {});
});

test("sanitizeSettings: array input → {} (arrays are typeof 'object' but rejected)", () => {
  assert.deepEqual(sanitizeSettings([{ mapApiKey: "x" }]), {});
});

test("sanitizeSettings: empty object → {}", () => {
  assert.deepEqual(sanitizeSettings({}), {});
});

test("sanitizeSettings: mixed allowed + unknown keys keeps only allowed", () => {
  const out = sanitizeSettings({
    mapApiKey: "kept",
    nope: "dropped",
    startingLat: 0,
    moreNope: { nested: "also dropped" },
  });
  assert.deepEqual(out, { mapApiKey: "kept", startingLat: 0 });
});

// === maskForRemote: the remote-client safety layer ===

test("maskForRemote: every API key field becomes a boolean reflecting truthiness", () => {
  assert.deepEqual(maskForRemote({ mapApiKey: "real-key", reverseGeoApiKey: null }),
    { mapApiKey: true, reverseGeoApiKey: false });
  assert.deepEqual(maskForRemote({ mapApiKey: "", reverseGeoApiKey: "x" }),
    { mapApiKey: false, reverseGeoApiKey: true });
  assert.deepEqual(maskForRemote({ mapApiKey: undefined }), { mapApiKey: false });
});

test("maskForRemote: a removed feature's credentials block never reaches a remote client", () => {
  // Left over in an old settings.json from the Homebridge integration.
  // It is no longer allow-listed, so default-deny drops it — the subtree
  // is absent, not masked.
  const out = maskForRemote({
    mapApiKey: "x",
    indoorTemperature: {
      enabled: true,
      host: "homebridge.local",
      username: "admin",
      password: "super-secret",
      sensorName: "Living Room",
    },
  });
  assert.ok(!("indoorTemperature" in out));
  const serialised = JSON.stringify(out);
  assert.ok(!serialised.includes("homebridge.local"));
  assert.ok(!serialised.includes("super-secret"));
  assert.ok(!serialised.includes("admin"));
});

test("maskForRemote: lat / lon pass through unchanged (not secrets)", () => {
  const out = maskForRemote({
    startingLat: 45.5017,
    startingLon: -73.5673,
  });
  assert.equal(out.startingLat, 45.5017);
  assert.equal(out.startingLon, -73.5673);
});

test("maskForRemote: `advanced` subtree passes through unchanged (no secrets)", () => {
  const out = maskForRemote({
    advanced: {
      display: { radarPalette: "scope", radarOpacity: 0.7 },
      sleep: { stage1Delay: 5 },
    },
  });
  assert.deepEqual(out.advanced, {
    display: { radarPalette: "scope", radarOpacity: 0.7 },
    sleep: { stage1Delay: 5 },
  });
});

test("maskForRemote: default-deny — an unknown top-level key never reaches a remote client", () => {
  // The mask is allow-list driven (sanitizeSettings first), not deny-list:
  // an UNRECOGNISED key (not on the whitelist) must be dropped, so a key
  // hand-added to settings.json — or left over from an older build — can't
  // leak verbatim. (A key deliberately added to ALLOWED_KEYS is whitelisted
  // and still passes; that's the case API_KEY_FIELDS / REMOTE_HIDDEN_KEYS
  // exist to handle.)
  const out = maskForRemote({
    mapApiKey: "secret-value",
    rogueSecret: "should-never-appear",
    debugToken: "also-secret",
    startingLat: 45.5,
  });
  assert.ok(!("rogueSecret" in out));
  assert.ok(!("debugToken" in out));
  // Known keys still behave: API key booleanised, lat passes through.
  assert.equal(out.mapApiKey, true);
  assert.equal(out.startingLat, 45.5);
});

test("maskForRemote: an unknown key whose name ends in 'ApiKey' is still dropped, not booleanised", () => {
  // The booleanisation is keyed on the explicit API_KEY_FIELDS set, not a
  // name pattern — and the default-deny projection drops the key entirely
  // before that anyway, so no value (or even its truthiness) escapes.
  const out = maskForRemote({ futureSecretApiKey: "leak" });
  assert.deepEqual(out, {});
});

test("maskForRemote: null / undefined / non-object input → {}", () => {
  assert.deepEqual(maskForRemote(null), {});
  assert.deepEqual(maskForRemote(undefined), {});
  assert.deepEqual(maskForRemote("string"), {});
  assert.deepEqual(maskForRemote([]), {});
});

test("maskForRemote: empty object → empty object", () => {
  assert.deepEqual(maskForRemote({}), {});
});

test("maskForRemote: realistic full-settings input — full strip + mask roundtrip", () => {
  // An old kiosk's file: the live keys plus everything the August 2026
  // rework stopped reading.
  const full = {
    weatherApiKey: "wak-123",
    mapApiKey: "mak-456",
    reverseGeoApiKey: "",
    anthropicApiKey: "ant-789",
    airNowApiKey: "",
    openAqApiKey: "oaq-000",
    startingLat: 45.5,
    startingLon: -73.5,
    radarSite: "KLWX",
    indoorTemperature: {
      enabled: true,
      host: "homebridge.local",
      port: 8581,
      username: "admin",
      password: "p4ssw0rd",
      sensorName: "Salon",
    },
    advanced: { display: { radarPalette: "nws" } },
  };
  const out = maskForRemote(full);

  assert.deepEqual(out, {
    // Booleans where the live keys were configured / empty
    mapApiKey: true,
    reverseGeoApiKey: false,
    // Non-secret data passes through (radarSite coerced to its IEM form)
    startingLat: 45.5,
    startingLon: -73.5,
    radarSite: "LWX",
    advanced: { display: { radarPalette: "nws" } },
    // The removed features' keys and the credentials block are gone
  });
  assert.ok(!JSON.stringify(out).includes("p4ssw0rd"));
});

// === Sanity checks on the Sets themselves ===

test("ALLOWED_KEYS is exactly the current top-level setting keys", () => {
  assert.deepEqual([...ALLOWED_KEYS].sort(), [
    "advanced", "favorites", "mapApiKey", "radarSite", "reverseGeoApiKey",
    "startingLat", "startingLon",
  ]);
});

test("ALLOWED_KEYS rejects the keys of removed features", () => {
  for (const k of ["weatherApiKey", "anthropicApiKey", "airNowApiKey", "openAqApiKey", "indoorTemperature"]) {
    assert.ok(!ALLOWED_KEYS.has(k), `"${k}" belongs to a removed feature and must not be accepted`);
    assert.ok(!API_KEY_FIELDS.has(k));
  }
});

test("API_KEY_FIELDS is a subset of ALLOWED_KEYS", () => {
  // Any API key field must also be writable — otherwise it could never be set
  // through the controller in the first place.
  for (const k of API_KEY_FIELDS) {
    assert.ok(ALLOWED_KEYS.has(k), `API key field "${k}" should also be allowed`);
  }
});

test("REMOTE_HIDDEN_KEYS is a subset of ALLOWED_KEYS (a hidden key that is not allowed is dead)", () => {
  for (const k of REMOTE_HIDDEN_KEYS) {
    assert.ok(ALLOWED_KEYS.has(k), `hidden key "${k}" should also be allowed`);
  }
});

// === ensureSecurePermissions: settings.json must be owner-only (0600) ===
// The file holds the API keys, so any other local account being able to
// read it is the vulnerability this closes.

test("FILE_MODE is 0600 (owner read/write only)", () => {
  assert.equal(FILE_MODE, 0o600);
});

test("ensureSecurePermissions: tightens a 0644 file to 0600", () => {
  const tmp = path.join(os.tmpdir(), `settings-perm-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(tmp, "{}");
  fs.chmodSync(tmp, 0o644); // force world-readable regardless of the umask
  assert.equal(fs.statSync(tmp).mode & 0o777, 0o644);
  try {
    ensureSecurePermissions(tmp);
    assert.equal(fs.statSync(tmp).mode & 0o777, 0o600);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test("ensureSecurePermissions: a non-existent path is a silent no-op (no throw)", () => {
  const missing = path.join(os.tmpdir(), `settings-absent-${process.pid}-${Date.now()}.json`);
  assert.doesNotThrow(() => ensureSecurePermissions(missing));
  assert.equal(fs.existsSync(missing), false);
});

// writeSettingsFile — the atomic tmp-write + fsync + rename pattern
// (2026-06 audit + ROADMAP #212). What we lock down: the write is
// atomic from a reader's point of view (no .tmp visible afterwards),
// the secure 0600 mode applies to the file from birth (the tmp file
// carries it, rename preserves it), and an overwrite replaces the
// content wholesale.

test("writeSettingsFile: atomic write — content, 0600 mode, no .tmp leftover", async () => {
  const target = path.join(os.tmpdir(), `settings-atomic-${process.pid}-${Date.now()}.json`);
  try {
    await writeSettingsFile({ mapApiKey: "abc", startingLat: "45.5" }, target);
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
    assert.deepEqual(parsed, { mapApiKey: "abc", startingLat: "45.5" });
    assert.equal(fs.statSync(target).mode & 0o777, FILE_MODE);
    const dir = path.dirname(target);
    const leftovers = fs.readdirSync(dir).filter((f) => f.startsWith(`${path.basename(target)}.`) && f.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "the tmp file must be renamed away");
  } finally {
    fs.rmSync(target, { force: true });
  }
});

test("writeSettingsFile: overwrite replaces the previous content wholesale", async () => {
  const target = path.join(os.tmpdir(), `settings-atomic-ow-${process.pid}-${Date.now()}.json`);
  try {
    await writeSettingsFile({ a: 1, b: 2 }, target);
    await writeSettingsFile({ c: 3 }, target);
    assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")), { c: 3 });
    const dir = path.dirname(target);
    const leftovers = fs.readdirSync(dir).filter((f) => f.startsWith(`${path.basename(target)}.`) && f.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "no tmp leftovers after overwrite");
  } finally {
    fs.rmSync(target, { force: true });
  }
});

test("writeSettingsFile: a failed rename removes its tmp file (no secrets stranded)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-atomic-fail-"));
  const target = path.join(dir, "settings.json");
  fs.mkdirSync(target); // rename(file -> existing directory) fails
  try {
    await assert.rejects(() => writeSettingsFile({ mapApiKey: "secret" }, target));
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "the error path must clean up its tmp file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sweepOrphanSettingsTmp: purges tmp siblings, keeps the settings file and .bak", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-sweep-"));
  const target = path.join(dir, "settings.json");
  try {
    fs.writeFileSync(target, "{}");
    fs.writeFileSync(`${target}.bak`, "{}");
    fs.writeFileSync(`${target}.tmp`, "{}");            // aborted install.sh shape
    fs.writeFileSync(`${target}.12345.7.tmp`, "{}");    // crashed atomic-writer shape
    sweepOrphanSettingsTmp(target);
    const remaining = fs.readdirSync(dir).sort();
    assert.deepEqual(remaining, ["settings.json", "settings.json.bak"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
