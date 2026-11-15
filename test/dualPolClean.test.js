// Tests for the dual-pol clean mode — the third setting of the clear-air
// noise filter, which drops the gates the volume scan's own hydrometeor
// classification calls non-meteorological.
//
// Two halves:
//
//   1. The MASK RULE, against synthetic payloads. Which classes go and
//      which stay is the whole feature, and a hand-built grid pins every
//      branch (including the one that is conditional on reflectivity)
//      without depending on what the weather happened to be doing.
//
//   2. The N0H DECODE, against a committed fixture — LWX at
//      2026-09-06T01:29:38Z, the scan behind the "why is there so much
//      noise even with the filter on" report. Unlike N0B and N0G this
//      product needs no shim (the library ships a definition for 165),
//      so the thing worth pinning is that it stays that way and that the
//      class codes keep their documented meanings.
//
// Run: `npm test`

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  applyClassMask,
  gridsAlign,
  MASK_CLASSES,
  BIG_DROPS_RAIN_MIN_DBZ,
  CLASS_PRODUCT,
  PRODUCTS,
  packRadials,
  wantsClean,
} = require("../server/radarRadialCtrl");
const parseLevel3 = require("nexrad-level-3-data");

const FIXTURE = path.join(__dirname, "fixtures", "LWX_N0H_2026_09_06_01_29_38.bin");

// Product 165's data levels, from the library's own key. The mask is
// written against these numbers, so a change in the library's table
// would silently repoint it.
const BI = 10;   // biological
const GC = 20;   // ground clutter / AP
const RA = 60;   // light and/or moderate rain
const BD = 80;   // big drops (rain)
const UK = 140;  // unknown

const SCALING = { min: -32, increment: 0.5, levels: 254 };
const levelFor = (dbz) => Math.round((dbz - SCALING.min) / SCALING.increment);

/**
 * Build a reflectivity payload and a classification payload over the
 * same tiny grid, one gate per (bucket, bin).
 *
 * @param {Array<Array<Number>>} gates rows of [dBZ, classCode]
 * @param {Number} [classBins] bins the classification covers (default: all)
 * @returns {{refl: Object, cls: Object}} payloads shaped like /api/radar/radial
 */
function grid(gates, classBins = gates.length) {
  const refl = {
    numBuckets: 1,
    numBins: gates.length,
    bucketDeg: 0.5,
    binKm: 0.25,
    firstBinKm: 0,
    reservedLevels: 2,
    scaling: SCALING,
    bins: Buffer.from(gates.map(([dbz]) => levelFor(dbz))).toString("base64"),
  };
  const cls = {
    numBuckets: 1,
    numBins: classBins,
    bucketDeg: 0.5,
    binKm: 0.25,
    firstBinKm: 0,
    reservedLevels: 1,
    scaling: { min: 0, increment: 1, levels: 16 },
    bins: Buffer.from(gates.slice(0, classBins).map(([, c]) => c)).toString("base64"),
  };
  return { refl, cls };
}

const levels = (payload) => [...Buffer.from(payload, "base64")];

test("biological, ground clutter and unknown are masked; weather is not", () => {
  const { refl, cls } = grid([
    [20, BI],   // the nocturnal bloom: masked
    [20, GC],   // clutter: masked
    [20, UK],   // unclassified: masked
    [20, RA],   // light rain at the same dBZ: kept
    [45, RA],   // a core: kept
  ]);
  const { bins, masked, considered } = applyClassMask(refl, cls);
  assert.deepEqual(levels(bins.toString("base64")).map((l) => l !== 0),
                   [false, false, false, true, true]);
  assert.equal(masked, 3);
  assert.equal(considered, 5);
});

test("big drops are masked only below the rain floor", () => {
  // BI and BD were one population in the scan this was built from — same
  // median dBZ, same range band — because insects and genuine big drops
  // share a high differential reflectivity. Intensity is what separates
  // them: real big drops live in convective cores.
  const below = BIG_DROPS_RAIN_MIN_DBZ - 0.5;
  const { refl, cls } = grid([
    [below, BD],
    [BIG_DROPS_RAIN_MIN_DBZ, BD],
    [45, BD],
  ]);
  const { bins, masked } = applyClassMask(refl, cls);
  assert.deepEqual(levels(bins.toString("base64")).map((l) => l !== 0),
                   [false, true, true]);
  assert.equal(masked, 1);
});

test("gates past the classification's range are left alone", () => {
  // The classification reaches 300 km, reflectivity 460. Beyond the
  // shorter product there is no verdict, so there is nothing to act on —
  // and inventing one would blank the outer ring of every scan.
  const { refl, cls } = grid([[20, BI], [20, BI], [20, BI]], 1);
  const { bins, masked, considered } = applyClassMask(refl, cls);
  assert.deepEqual(levels(bins.toString("base64")).map((l) => l !== 0),
                   [false, true, true]);
  assert.equal(masked, 1);
  // `considered` counts the gates there was a verdict for, not every echo
  // gate — so masked/considered reads as "of what could be judged, how
  // much was junk" rather than being diluted by the unjudgeable ring.
  assert.equal(considered, 1);
});

test("below-threshold reflectivity gates are not counted as considered", () => {
  const { refl, cls } = grid([[20, BI], [20, RA]]);
  const b = Buffer.from(refl.bins, "base64");
  b[0] = 0; // below threshold
  refl.bins = b.toString("base64");
  const { masked, considered } = applyClassMask(refl, cls);
  assert.equal(considered, 1);
  assert.equal(masked, 0);
});

test("a mismatched grid is refused rather than misapplied", () => {
  // The mask indexes reflectivity's own bucket/bin grid. A different
  // grid would paint the stencil somewhere else on the map, which is
  // worse than not painting it at all.
  const { refl, cls } = grid([[20, BI]]);
  assert.equal(gridsAlign(refl, cls), true);
  assert.equal(gridsAlign(refl, { ...cls, bucketDeg: 1 }), false);
  assert.equal(gridsAlign(refl, { ...cls, binKm: 1 }), false);
  assert.equal(gridsAlign(refl, { ...cls, firstBinKm: 2 }), false);
  assert.equal(gridsAlign(refl, { ...cls, numBuckets: 360 }), false);
});

test("the mask rule names the classes it claims to", () => {
  assert.deepEqual([...MASK_CLASSES].sort((a, b) => a - b), [BI, GC, UK]);
  assert.equal(BIG_DROPS_RAIN_MIN_DBZ, 30);
  assert.equal(CLASS_PRODUCT, "N0H");
});

test("N0H decodes with no shim, on the grid the mask assumes", () => {
  // Product 165 already exists in nexrad-level-3-data, unlike 153/154 —
  // the controller's shim loop must leave it alone. If a library upgrade
  // ever drops it, this fails here rather than on a kiosk at night.
  const def = PRODUCTS[CLASS_PRODUCT];
  assert.equal(def.code, 165);
  assert.equal(def.kind, "classification");

  const parsed = parseLevel3(fs.readFileSync(FIXTURE));
  const packet = parsed.radialPackets[0];
  assert.equal(parsed.productDescription.elevationAngle, 0.5);
  // 1 degree azimuthally against reflectivity's 0.5, and 300 km of range
  // against 460 — coarser and shorter, which is why the mask is applied
  // by coverage rather than by radial index, and why the outer ring of a
  // 460 km scan keeps its gates.
  assert.equal(packet.radialsRaw.length, 360);
  assert.equal(packet.numberBins, 1200);
  assert.equal(packet.radialsRaw[0].angleDelta, 1);

  // packRadials re-buckets those 1-degree radials into the same 0.5-degree
  // slots reflectivity uses — every slot covered, which is what lets the
  // mask index straight across.
  const packed = packRadials(packet.radialsRaw, packet.numberBins);
  assert.equal(packed.length, 720 * 1200);
  const codes = new Set(packed);
  // The bloom this fixture captured: biological everywhere, almost no rain.
  assert.ok(codes.has(BI), "expected biological gates in the fixture");
  const count = (c) => packed.reduce((n, v) => n + (v === c ? 1 : 0), 0);
  assert.ok(count(BI) > count(RA) * 10,
            `expected a biological bloom, got BI ${count(BI)} vs RA ${count(RA)}`);
});

test("clean is decided from the query STRING, and only for reflectivity", () => {
  // A query parameter is a string under Express, and equally in the
  // Android app: standalone/install.js stringifies axios `params` before
  // handing them to this handler, so the app and the kiosk take the same
  // path through one controller rather than diverging on a type.
  assert.equal(wantsClean("1", "N0B"), true);
  assert.equal(wantsClean(1, "N0B"), true);
  assert.equal(wantsClean("0", "N0B"), false);
  assert.equal(wantsClean(undefined, "N0B"), false);
  // Velocity is a different field; the classification says nothing about it.
  assert.equal(wantsClean("1", "N0G"), false);
  assert.equal(wantsClean("1", CLASS_PRODUCT), false);
  assert.equal(wantsClean("1", "NOPE"), false);
});

// ── Class-aware floor (2026-09-22) ────────────────────────────────────
// The clear-air floor moved into the mask: verdict-less gates (ND, RF,
// and everything past the classification's reach) are dropped below
// CLEAN_FLOOR_DBZ; anything the classifier calls precipitation is kept at
// any intensity, so light rain is no longer hidden in clean mode.

const { CLEAN_FLOOR_DBZ, NUM_BUCKETS } = require("../server/radarRadialCtrl");
const ND = 0;
const RF = 150;

test("clean floor equals the client's NOISE_FILTER_MIN_DBZ (15)", () => {
  // radialRender.js keeps the plain floor for tiles and unmasked scans;
  // the two must agree or dbz-only and clean would disagree about drizzle.
  assert.equal(CLEAN_FLOOR_DBZ, 15);
});

test("verdict-less gates get the floor; classified precipitation does not", () => {
  const { refl, cls } = grid([
    [8, RA],    // drizzle the classifier vouches for: KEPT
    [8, ND],    // faint echo, no verdict: floored
    [8, RF],    // range folded, no verdict: floored
    [20, ND],   // echo above the floor, no verdict: kept
    [8, BI],    // faint biological: masked (as before)
  ]);
  const { bins, masked, considered, floored } = applyClassMask(refl, cls);
  assert.deepEqual(levels(bins.toString("base64")).map((l) => l !== 0),
                   [true, false, false, true, false]);
  assert.equal(floored, 2);
  assert.equal(masked, 1);
  // ND / RF gates are not "considered" — there was no verdict to judge.
  assert.equal(considered, 2);
});

test("faint reflectivity beyond the classification's range is floored, strong is kept", () => {
  // Reflectivity reaches 460 km, the classification 300 km. The outer ring
  // used to be left alone entirely; once the client stops flooring, that
  // ring needs the floor applied here or it fills with clear-air speckle.
  const { refl, cls } = grid([[20, RA], [8, RA], [20, RA]], 1);
  const { bins, floored } = applyClassMask(refl, cls);
  assert.deepEqual(levels(bins.toString("base64")).map((l) => l !== 0), [true, false, true]);
  assert.equal(floored, 1);
});

test("cleanRadial reports the floor it applied", async () => {
  // Same shape as the other cleanRadial tests would need — exercised
  // through applyClassMask's report fields the payload copies verbatim.
  const { refl, cls } = grid([[8, ND], [8, RA]]);
  const r = applyClassMask(refl, cls);
  assert.equal(r.floored, 1);
  assert.equal(typeof CLEAN_FLOOR_DBZ, "number");
});

test("live LWX scan 2026-09-22 04:01:42 Z: 51 056 rain gates under 15 dBZ survive the mask", () => {
  // The scan pair the change was measured on — light rain over the
  // mid-Atlantic. Decoded exactly as the controller does (parseLevel3 →
  // packRadials); the numbers below were first taken through the live
  // route on the night and are pinned here so the floor can never quietly
  // creep back over classified drizzle.
  const load = (name) => {
    const parsed = parseLevel3(fs.readFileSync(path.join(__dirname, "fixtures", name)));
    const packet = parsed.radialPackets[0];
    return { numBins: packet.numberBins, bins: packRadials(packet.radialsRaw, packet.numberBins) };
  };
  const b = load("LWX_N0B_2026_09_22_04_01_42.bin");
  const h = load("LWX_N0H_2026_09_22_04_01_42.bin");
  const refl = {
    numBuckets: NUM_BUCKETS, bucketDeg: 0.5, binKm: 0.25, firstBinKm: 0, numBins: b.numBins,
    reservedLevels: 2, scaling: SCALING, bins: b.bins.toString("base64"),
  };
  const cls = {
    numBuckets: NUM_BUCKETS, bucketDeg: 0.5, binKm: 0.25, firstBinKm: 0, numBins: h.numBins,
    reservedLevels: 1, scaling: PRODUCTS.N0H.scaling, bins: h.bins.toString("base64"),
  };
  assert.equal(refl.numBins, 1840);
  assert.equal(cls.numBins, 1200);
  const { bins } = applyClassMask(refl, cls);
  const out = Buffer.from(bins);
  let rainFaintKept = 0;
  let rainFaintTotal = 0;
  let bioKept = 0;
  let ndFaintKept = 0;
  let ndStrongKept = 0;
  for (let a = 0; a < NUM_BUCKETS; a += 1) {
    for (let i = 0; i < cls.numBins; i += 1) {
      const level = b.bins[a * refl.numBins + i];
      if (level < 2) continue;
      const dbz = SCALING.min + level * SCALING.increment;
      const code = h.bins[a * cls.numBins + i];
      const kept = out[a * refl.numBins + i] !== 0;
      if (code === RA && dbz < 15) { rainFaintTotal += 1; if (kept) rainFaintKept += 1; }
      if (code === BI && kept) bioKept += 1;
      if (code === ND && dbz < 15 && kept) ndFaintKept += 1;
      if (code === ND && dbz >= 15 && kept) ndStrongKept += 1;
    }
  }
  assert.equal(rainFaintTotal, 51056);
  assert.equal(rainFaintKept, 51056, "every rain-classified gate under the floor is drawn");
  assert.equal(bioKept, 0, "the bloom is still gone");
  assert.equal(ndFaintKept, 0, "verdict-less faint echo is still floored");
  assert.equal(ndStrongKept, 703, "verdict-less echo above the floor is drawn as before");
});

// ── CC gate on ice crystals / dry snow (2026-11-15) ───────────────────

const IC = 30;  // ice crystals
const DS = 40;  // dry snow
const WS = 50;  // wet snow
const { CLEAN_FROZEN_MIN_CC, decodeBuffer, mergePrecipType, radialTtl } = require("../server/radarRadialCtrl");
const CC_SCALE = { min: 60.5 / 300, increment: 1 / 300, levels: 254 };
const ccLevel = (v) => Math.round((v - CC_SCALE.min) / CC_SCALE.increment);

/** A CC payload over grid()'s geometry; `null` entries are level 0 (no data). */
function ccGrid(values) {
  return {
    numBuckets: 1,
    numBins: values.length,
    bucketDeg: 0.5,
    binKm: 0.25,
    firstBinKm: 0,
    reservedLevels: 2,
    scaling: CC_SCALE,
    bins: Buffer.from(values.map((v) => (v === null ? 0 : ccLevel(v)))).toString("base64"),
  };
}

test("CC gate: low-CC ice crystals / dry snow are masked, uniform ones and other classes kept", () => {
  const { refl, cls } = grid([
    [12, IC],  // birds above the melting level: masked
    [12, DS],  // ditto: masked
    [12, IC],  // real ice, uniform: kept
    [25, DS],  // real snow: kept
    [25, WS],  // melting layer, low CC legitimately: kept
    [20, RA],  // rain with a noisy CC: kept (gate is frozen classes only)
    [12, IC],  // no CC for this gate: no evidence, kept
  ]);
  const cc = ccGrid([0.6, 0.7, 0.97, 0.99, 0.8, 0.8, null]);
  const r = applyClassMask(refl, cls, undefined, cc);
  assert.deepEqual(levels(r.bins.toString("base64")).map((l) => l !== 0),
                   [false, false, true, true, true, true, true]);
  assert.equal(r.ccMasked, 2);
  assert.equal(r.masked, 2);
  assert.equal(r.ccUsed, true);
  // Without CC the mask is exactly what it was.
  const plain = applyClassMask(refl, cls);
  assert.equal(plain.masked, 0);
  assert.equal(plain.ccMasked, 0);
  assert.equal(plain.ccUsed, false);
});

test("CC gate: a CC on another grid is ignored, not misapplied", () => {
  const { refl, cls } = grid([[12, IC], [12, DS]]);
  const cc = { ...ccGrid([0.5, 0.5]), binKm: 1 };
  const r = applyClassMask(refl, cls, undefined, cc);
  assert.equal(r.ccUsed, false);
  assert.equal(r.masked, 0);
});

test("CC gate threshold is 0.85 and also applies to precipitation type", () => {
  assert.equal(CLEAN_FROZEN_MIN_CC, 0.85);
  const { refl, cls } = grid([[20, IC], [20, DS], [20, RA]]);
  const cc = ccGrid([0.6, 0.98, 0.6]);
  const r = mergePrecipType(refl, cls, cc);
  assert.equal(r.ccMasked, 1);
  assert.equal(r.drawn, 2);
  assert.equal(r.bins[0], 0, "low-CC 'ice' is not painted as ice");
  assert.notEqual(r.bins[1], 0);
  assert.notEqual(r.bins[2], 0, "rain is never CC-gated");
});

test("a cleaned frame still waiting on its CC is cached briefly", () => {
  assert.equal(radialTtl({ clean: { applied: true, cc: { applied: false, reason: "no-cc", pending: true } } }, 60000), 15000);
  assert.equal(radialTtl({ clean: { applied: true, cc: { applied: false, reason: "no-cc", pending: false } } }, 60000), 60000);
  assert.equal(radialTtl({ clean: { applied: true, cc: { applied: true } } }, 60000), 60000);
  assert.equal(radialTtl({ clean: { applied: false, reason: "no-classification" } }, 60000), 15000);
  assert.equal(radialTtl({ clean: { applied: false, reason: "grid-mismatch" } }, 60000), 60000);
  assert.equal(radialTtl({}, 60000), 60000);
});

/** Decode a committed N0B / N0H / N0C triplet through the controller's own path. */
function triplet(site, stamp) {
  const load = (product) => {
    const key = `${site}_${product}_${stamp}`;
    return decodeBuffer(site, product, key, fs.readFileSync(path.join(__dirname, "fixtures", `${key}.bin`)));
  };
  return { refl: load("N0B"), cls: load("N0H"), cc: load("N0C") };
}

function drawnByClass(refl, cls, bins) {
  const cb = Buffer.from(cls.bins, "base64");
  const out = { total: 0 };
  for (let a = 0; a < refl.numBuckets; a += 1) {
    for (let b = 0; b < refl.numBins; b += 1) {
      if (bins[a * refl.numBins + b] < refl.reservedLevels) continue;
      const code = b < cls.numBins ? cb[a * cls.numBins + b] : ND;
      out.total += 1;
      out[code] = (out[code] || 0) + 1;
    }
  }
  return out;
}

test("live LWX 2026-11-15 23:25 Z, a clear evening: the CC gate removes the 'ice' birds", () => {
  // The kiosk photo: "Dual-pol clean" on, sky clear, grey patches 40-160
  // km out. Before the gate the mask drew 51 774 gates, 41 832 of them IC
  // and 9 500 DS; with it, 1 916. Rain is untouched.
  const { refl, cls, cc } = triplet("LWX", "2026_11_15_23_25_18");
  const before = drawnByClass(refl, cls, applyClassMask(refl, cls).bins);
  const r = applyClassMask(refl, cls, undefined, cc);
  const after = drawnByClass(refl, cls, r.bins);
  assert.equal(r.ccUsed, true);
  assert.equal(before.total, 51774);
  assert.equal(before[IC], 41832);
  assert.equal(before[DS], 9500);
  assert.equal(after.total, 1916);
  assert.equal(after[RA], before[RA], "rain kept");
  assert.equal(after[WS], before[WS], "wet snow kept");
  assert.ok(after.total / before.total < 0.04, "96 %+ of the drawn speckle gone");
});

test("live MSX 2026-11-15 23:24 Z, real snow: the CC gate keeps it", () => {
  // Missoula, snowing at the same minute: 74 866 DS and 36 730 IC gates,
  // CC uniformly high. The gate must cost almost nothing here.
  const { refl, cls, cc } = triplet("MSX", "2026_11_15_23_24_53");
  const before = drawnByClass(refl, cls, applyClassMask(refl, cls).bins);
  const r = applyClassMask(refl, cls, undefined, cc);
  const after = drawnByClass(refl, cls, r.bins);
  assert.equal(before.total, 112231);
  assert.equal(after.total, 112146);
  assert.ok(after.total / before.total > 0.999, "snow survives");
});
