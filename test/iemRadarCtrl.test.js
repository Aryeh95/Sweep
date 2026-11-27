// Tests for the IEM radar controller's pure helpers
// (`server/iemRadarCtrl.js`).
//
// Unlike the client-side test files in this directory, this one
// `require()`s the real module — the server is CJS, so no verbatim copy
// is needed and no drift is possible.
//
// The transforms covered here are the ones where a silent error would
// be hard to spot on screen: a wrong timestamp format produces a 503
// from IEM (blank radar, no error surfaced to the user), and a wrong
// site id produces tiles for the wrong part of the country — which
// looks like plausible weather, just not yours.
//
// Run: `npm test`

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const iem = require("../server/iemRadarCtrl");
const { clearStatusCache } = require("../server/radarStatusCtrl");

const { toTileStamp, toEpochMs, normalizeSiteId } = iem;

test("toTileStamp converts IEM scan times to the RIDGE URL segment", () => {
  // The exact form IEM's `operation=list` returns, and the exact form
  // the `ridge::XXX-N0B-<stamp>` tile path expects. Verified live
  // against both endpoints on 2026-08-11.
  assert.equal(toTileStamp("2026-08-11T21:51Z"), "202608112151");
  // Zero-padding must survive on every component.
  assert.equal(toTileStamp("2026-01-02T03:04Z"), "202601020304");
  // Midnight is the case a naive formatter most often breaks.
  assert.equal(toTileStamp("2026-12-31T00:00Z"), "202612310000");
});

test("toTileStamp rejects anything it cannot parse", () => {
  // A malformed value must NOT silently become a plausible-looking
  // stamp — a wrong-but-well-formed timestamp yields a 503 and blank
  // radar, whereas null lets the caller drop the frame.
  for (const bad of ["", "garbage", "2026-08-11", null, undefined, 42, {}]) {
    assert.equal(toTileStamp(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("toEpochMs parses IEM scan times as UTC", () => {
  // The trailing Z makes these unambiguous; the parsed value must not
  // drift with the machine's local timezone, or every displayed frame
  // age would be off by the UTC offset.
  assert.equal(toEpochMs("2026-08-11T21:51Z"), Date.UTC(2026, 7, 11, 21, 51, 0, 0));
  assert.equal(toEpochMs("2026-01-01T00:00Z"), Date.UTC(2026, 0, 1, 0, 0, 0, 0));
  assert.equal(toEpochMs("nonsense"), null);
  assert.equal(toEpochMs(null), null);
});

test("normalizeSiteId maps NWS 4-char station ids to IEM's 3-char form", () => {
  // api.weather.gov/points reports an ICAO-style id; IEM's RIDGE layers
  // use three letters. Dropping the leading region letter is correct
  // across all NEXRAD regions, not just CONUS.
  assert.equal(normalizeSiteId("KDIX"), "DIX");   // CONUS  (verified live)
  assert.equal(normalizeSiteId("PAHG"), "AHG");   // Alaska
  assert.equal(normalizeSiteId("TJUA"), "JUA");   // Puerto Rico
  assert.equal(normalizeSiteId("PHKI"), "HKI");   // Hawaii
});

test("normalizeSiteId passes through ids that are already 3 characters", () => {
  // IEM's own `operation=available` returns the short form, so the
  // fallback path must not strip a second letter off it.
  assert.equal(normalizeSiteId("DIX"), "DIX");
  assert.equal(normalizeSiteId("dix"), "DIX");
  assert.equal(normalizeSiteId("  dix  "), "DIX");
});

test("normalizeSiteId rejects implausible ids", () => {
  // Guards the query-parameter path on /api/radar/frames: `site` comes
  // straight from the client, and it is interpolated into an outbound
  // URL. Anything not [A-Z]{3,4} must be refused rather than passed on.
  for (const bad of ["", "X", "XX", "TOOLONG", "DI1", "D-X", "../x", null, undefined, 7]) {
    assert.equal(normalizeSiteId(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("parseSatelliteMeta: relays the GOES sidecar valid time, null without one", () => {
  const { parseSatelliteMeta } = require("../server/iemRadarCtrl");
  // Shape of GOES-19_C13.json as served 2026-09-25.
  const live = {
    generated_at: "2026-09-25T18:59:11Z",
    meta: { valid: "2026-09-25T18:56:16Z", proj4str: "+proj=geos +h=35786023.0 +lon_0=-75.0 +sweep=x" },
  };
  assert.deepEqual(parseSatelliteMeta(live), { valid: "2026-09-25T18:56:16Z", epoch: Date.parse("2026-09-25T18:56:16Z") });
  assert.equal(parseSatelliteMeta({ meta: {} }), null);
  assert.equal(parseSatelliteMeta({ meta: { valid: "not a time" } }), null);
  assert.equal(parseSatelliteMeta(null), null);
});

test("parseMosaicMeta: relays IEM's composite valid time, null without one", () => {
  const { parseMosaicMeta } = require("../server/iemRadarCtrl");
  const meta = parseMosaicMeta({
    meta: { product: "N0Q", site: "USCOMP", valid: "2026-09-03T02:55:00Z", radar_quorum: "142/147" },
  });
  assert.equal(meta.valid, "2026-09-03T02:55:00Z");
  assert.equal(meta.epoch, Date.UTC(2026, 8, 3, 2, 55));
  assert.equal(meta.radarQuorum, "142/147");
  assert.equal(parseMosaicMeta({}), null);
  assert.equal(parseMosaicMeta(null), null);
  assert.equal(parseMosaicMeta({ meta: { valid: "garbage" } }), null);
});

// ---- Automatic offline-radar failover -----------------------------------

beforeEach(() => {
  iem.clearRadarCaches();
  clearStatusCache();
});

afterEach(() => {
  iem.clearRadarCaches();
  clearStatusCache();
});

function makeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

function isoMinAgo(nowMs, minAgo) {
  return `${new Date(nowMs - minAgo * 60_000).toISOString().slice(0, 16)}Z`;
}

function nwsStationsPayload({ nowMs, lwxOnline, doxOnline = true }) {
  const mk = (id, online) => ({
    properties: {
      id,
      stationType: "WSR-88D",
      latency: {
        levelTwoLastReceivedTime: new Date(nowMs - (online ? 1 : 90) * 60_000).toISOString(),
      },
      rda: {
        properties: {
          status: online ? "Operate" : "Start-Up",
          operabilityStatus: online ? "RDA - On-line" : "RDA - Inoperable",
        },
      },
    },
  });
  return {
    features: [mk("KLWX", lwxOnline), mk("KDOX", doxOnline)],
  };
}

test("framesAreStale flags empty, malformed, and past-15-min lists", () => {
  const now = Date.UTC(2026, 10, 27, 2, 40, 0);
  assert.equal(iem.framesAreStale([], now), true);
  assert.equal(iem.framesAreStale(null, now), true);
  assert.equal(iem.framesAreStale([{ stamp: "bad", epoch: NaN }], now), true);
  assert.equal(iem.framesAreStale([{ epoch: now - 5 * 60_000 }], now), false);
  assert.equal(iem.framesAreStale([{ epoch: now - 15 * 60_000 }], now), false);
  assert.equal(iem.framesAreStale([{ epoch: now - 16 * 60_000 }], now), true);
});

test("rankFallbackCandidates ranks nearby radars within 250 km and falls back to site coords", () => {
  const pikesville = iem.rankFallbackCandidates("LWX", { lat: 39.37, lon: -76.72 });
  assert.ok(pikesville.length >= 2);
  assert.equal(pikesville[0].site, "DOX");
  assert.ok(pikesville.some((c) => c.site === "CCX") && pikesville.some((c) => c.site === "DIX"));
  assert.ok(pikesville.every((c) => c.site !== "LWX" && c.distKm <= iem.FAILOVER_MAX_KM));

  const noCoord = iem.rankFallbackCandidates("LWX", null);
  assert.equal(noCoord[0].site, "DOX");
  assert.ok(noCoord.every((c) => c.distKm <= iem.FAILOVER_MAX_KM));

  assert.deepEqual(iem.rankFallbackCandidates("JUA", null), []);
});

test("pickOnlineFallback fails open unless primary is explicitly offline and a candidate is online", () => {
  const cands = [
    { site: "DOX", distKm: 126 },
    { site: "DIX", distKm: 208 },
    { site: "FAR", distKm: 300 },
  ];
  assert.equal(iem.pickOnlineFallback("LWX", cands, null), null);
  assert.equal(iem.pickOnlineFallback("LWX", cands, { available: false, sites: {} }), null);
  assert.equal(iem.pickOnlineFallback("LWX", cands, {
    available: true,
    sites: { LWX: { state: "online" }, DOX: { state: "online" } },
  }), null);
  assert.equal(iem.pickOnlineFallback("LWX", cands, {
    available: true,
    sites: { LWX: { state: "unknown" }, DOX: { state: "online" } },
  }), null);
  assert.equal(iem.pickOnlineFallback("LWX", cands, {
    available: true,
    sites: { DOX: { state: "online" } },
  }), null);

  // Skips offline/unknown candidates and respects FAILOVER_MAX_KM.
  const pick = iem.pickOnlineFallback("LWX", cands, {
    available: true,
    sites: {
      LWX: { state: "offline" },
      DOX: { state: "unknown" },
      DIX: { state: "online" },
      FAR: { state: "online" },
    },
  });
  assert.equal(pick && pick.site, "DIX");

  // All in-range candidates offline (only out-of-range FAR online) → null.
  assert.equal(iem.pickOnlineFallback("LWX", cands, {
    available: true,
    sites: {
      LWX: { state: "offline" },
      DOX: { state: "offline" },
      DIX: { state: "offline" },
      FAR: { state: "online" },
    },
  }), null);
});

test("getRadarFrames skips status lookup when primary is fresh and lazily fails over + recovers when LWX goes offline", async () => {
  const origGet = axios.get;
  let lwxOnline = true;
  let statusCalls = 0;
  let lwxListCalls = 0;

  axios.get = async (url, cfg = {}) => {
    const p = cfg.params || {};
    if (url.includes("/json/radar.py") && p.operation === "available") {
      return {
        data: {
          radars: [
            { id: "LWX", type: "NEXRAD", name: "Sterling", lat: 38.9753, lon: -77.4778 },
            { id: "DOX", type: "NEXRAD", name: "Dover AFB", lat: 38.8256, lon: -75.44 },
          ],
        },
      };
    }
    if (url.includes("/json/radar.py") && p.operation === "list") {
      const nowMs = Date.now();
      if (p.radar === "LWX") {
        lwxListCalls += 1;
        return { data: { scans: [{ ts: isoMinAgo(nowMs, lwxOnline ? 2 : 70) }] } };
      }
      if (p.radar === "DOX") {
        return { data: { scans: [{ ts: isoMinAgo(nowMs, 2) }] } };
      }
    }
    if (url.includes("/radar/stations")) {
      statusCalls += 1;
      return { data: nwsStationsPayload({ nowMs: Date.now(), lwxOnline, doxOnline: true }) };
    }
    if (url.includes("n0q_0.json")) {
      return { data: { meta: { valid: new Date(Date.now() - 120_000).toISOString() } } };
    }
    if (url.includes("GOES-19_")) {
      return { data: { meta: { valid: new Date(Date.now() - 180_000).toISOString() } } };
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };

  try {
    // 1. Primary healthy & fresh → zero /radar/stations requests.
    let res = makeRes();
    await iem.getRadarFrames({ query: { lat: "39.37", lon: "-76.72" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.site, "LWX");
    assert.equal(res.body.fallbackFrom, null);
    assert.equal(statusCalls, 0);
    assert.equal(lwxListCalls, 1);

    // 2. Primary goes stale + offline → lazily fetches /radar/stations and fails over to DOX.
    lwxOnline = false;
    iem.clearRadarCaches();
    clearStatusCache();
    res = makeRes();
    await iem.getRadarFrames({ query: { lat: "39.37", lon: "-76.72", count: "28" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.site, "DOX");
    assert.equal(res.body.fallbackFrom, "LWX");
    assert.equal(statusCalls, 1);
    assert.equal(lwxListCalls, 2);
    assert.equal(iem.isFailoverActive("LWX"), true);

    // /api/radar/site also reflects active failover while leaving settings untouched.
    const siteRes = makeRes();
    await iem.getRadarSite({ query: { lat: "39.37", lon: "-76.72" } }, siteRes);
    assert.equal(siteRes.statusCode, 200);
    assert.equal(siteRes.body.site, "DOX");
    assert.equal(siteRes.body.fallbackFrom, "LWX");

    // 3. Subsequent poll during failover skips LWX list query and keeps serving DOX.
    res = makeRes();
    await iem.getRadarFrames({ query: { lat: "39.37", lon: "-76.72", count: "27" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.site, "DOX");
    assert.equal(res.body.fallbackFrom, "LWX");
    assert.equal(lwxListCalls, 2, "must not re-poll offline LWX while failover is active");

    // 4. Primary recovers once status cache refreshes → snaps back to LWX.
    lwxOnline = true;
    clearStatusCache();
    res = makeRes();
    await iem.getRadarFrames({ query: { lat: "39.37", lon: "-76.72", count: "26" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.site, "LWX");
    assert.equal(res.body.fallbackFrom, null);
    assert.equal(iem.isFailoverActive("LWX"), false);
  } finally {
    axios.get = origGet;
  }
});

test("getRadarFrames fails over for a manual site pin and fails open when status feed errors", async () => {
  const origGet = axios.get;
  let failStatus = false;

  axios.get = async (url, cfg = {}) => {
    const p = cfg.params || {};
    if (url.includes("/json/radar.py") && p.operation === "list") {
      const nowMs = Date.now();
      if (p.radar === "LWX") return { data: { scans: [{ ts: isoMinAgo(nowMs, 70) }] } };
      if (p.radar === "DOX") return { data: { scans: [{ ts: isoMinAgo(nowMs, 2) }] } };
    }
    if (url.includes("/radar/stations")) {
      if (failStatus) throw new Error("NWS status down");
      return { data: nwsStationsPayload({ nowMs: Date.now(), lwxOnline: false, doxOnline: true }) };
    }
    if (url.includes("n0q_0.json") || url.includes("GOES-19_")) {
      return { data: { meta: { valid: new Date(Date.now() - 120_000).toISOString() } } };
    }
    throw new Error(`Unexpected URL in test: ${url}`);
  };

  try {
    // Manual pin fails over to DOX.
    let res = makeRes();
    await iem.getRadarFrames({ query: { site: "LWX", lat: "39.37", lon: "-76.72" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.site, "DOX");
    assert.equal(res.body.fallbackFrom, "LWX");

    // Primary stale + status feed unreachable → fails open and stays on LWX.
    iem.clearRadarCaches();
    clearStatusCache();
    failStatus = true;
    res = makeRes();
    await iem.getRadarFrames({ query: { site: "LWX", lat: "39.37", lon: "-76.72" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.site, "LWX");
    assert.equal(res.body.fallbackFrom, null);
  } finally {
    axios.get = origGet;
  }
});
