# Sweep — Roadmap

What is still open after the August–November 2026 radar builds. Not a
schedule. The pre-rework roadmap, with its forecast, air-quality and
Canadian-source items, is preserved in
[`docs/archive/`](docs/archive/) for the record; almost all of it became
moot when the project narrowed to a radar viewer.

## Shipped (details in [CHANGELOG.md](CHANGELOG.md) and [CLAUDE.md](CLAUDE.md))

- **Radar & mosaics:** two-layer NEXRAD radar with per-layer frame age · MRMS
  1 km `ReflectivityAtLowestAltitude` mosaic with automatic IEM N0Q fallback ·
  raw Level III radial rendering + progressive loop playback (`N0B`
  reflectivity, `N0G` base velocity, `N0C` correlation coefficient, `PTYPE`
  precipitation type + MRMS surface precip mosaic, `DAA`/`DU3`/`DTA` rainfall
  accumulation + MRMS 1 h / 3 h QPE mosaic) · RadarScope-style & NWS palettes
  · interactive hover / press-and-hold multi-layer readout + pinned "Set home
  here".
- **Clutter & severe features:** three-state noise filter (`off` / 15 dBZ floor
  / server-side `N0H` dual-pol clean with class-aware floor and `N0C` `CC ≥
  0.85` ice/bird gating) · STI storm tracks + NMD mesocyclone/TVS + tornado
  debris signature (`TDS`) + MRMS MESH hail size + storm arrival leads ·
  GOES-19 GLM total lightning · GOES-19 channel-13 infrared / color-enhanced IR
  (looped) + visible satellite · RadarScope-style WSR-88D site picker with
  red offline-radar chips · 25-member Lagrangian ensemble point nowcast with
  per-pin live skill verification.
- **Kiosk, mobile & integrations:** standalone serverless Android app (`app/`
  + `client/src/standalone/`) with follow-me GPS, wake lock, and optional
  `pk.` Mapbox basemap · automated CI `client/dist` rebuilds + signed release
  APK publishing (`build.yml`) · **wake-for-warnings** (`server/warningWake.js`,
  waking and holding the screensaver awake during active Severe / Tornado
  Warnings with optional quiet hours) · opt-in `:8099` **Home Assistant**
  `/summary` sensor bridge and frameless `/embed` dashboard map · idle-aware
  polling and local NOAA solar calculation.

---

## Open radar features

### 🌀 Alert-driven map attention mode (partially shipped)
✅ **Shipped (2026-10-11):** wake-for-warnings (`warningWake.js`) wakes the
screensaver and holds the display awake while a Severe Thunderstorm or Tornado
Warning covers the home pin, with quiet-hours narrowing to Tornado Warnings
and active home warnings surfaced on the nowcast card.
⏳ **Still open:** optionally auto-zooming to the single-site band and
temporarily enabling storm tracks + lightning when a warning fires, with a
one-tap dismiss.

### 🌡️ Velocity fallback and upper tilts
Velocity mode has no tile fallback (IEM serves none), so a frame whose N0G
radial has not rendered shows nothing at high zoom until the loop warms.
Separately, the same product-153/154 shim decodes `N1B`/`N1G` (higher tilts) —
a tilt picker is straightforward if multi-tilt inspection is wanted.

### 🧭 Storm-relative velocity and arrival refinements
The arrival estimate is straight-line from SCIT's forecast positions. Small
refinements: show miss distance in the label when > 5 km, grey the label when
a cell's `speedKt` disagrees with its forecast span, or expose `N0S`
(storm-relative velocity) for rotation inspection in fast-moving lines.

### 📡 Level II (only if latency still hurts)
`unidata-nexrad-level2-chunks` gives partial sweeps as the radar turns, all
tilts and full dual-pol moments. Only worth the chunk-assembly complexity if
the 4–6 min Level III cadence remains annoying.

### 🌊 NWPS river gauges
Research captured in
[`docs/research-nws-hydro-and-gis-sources.md`](docs/research-nws-hydro-and-gis-sources.md).
Fits a flood-warning radar view; keyless.

---

## Kiosk and operations

### 🩹 Dedicated `pi-weather-kiosk.service` with `Restart=always`
The kiosk browser is launched by an autostart entry that runs once per
session; a browser crash leaves the screen dark until the next login or
relaunch. A `--user` unit with `Restart=always` fixes that at the root, gated
on replacing the four autostart paths (`labwc` / `wayfire` / `LXDE-pi` / XDG)
cleanly across `install.sh` and `uninstall.sh`.

### ❤️ Health classifier & graceful shutdown
LocationIQ is optional; consider demoting it from `CRITICAL_SERVICES` in
`healthCtrl.js` when unconfigured so a failing optional geocoder paints yellow
instead of red, and drain in-flight connections with `server.close()` inside
`shutdown()`.

### 👀 Vendor watch — Mapbox raster tiles
The one paid dependency on the kiosk. Metered against the 50 000/month free
tier in `requestCounter.js`; watch `mapbox → tiles` in the debug panel (plan B
documented in [`docs/maptiler-cloud-plan-b.md`](docs/maptiler-cloud-plan-b.md)).

---

## Technical debt

### ✅ Committed-`dist` reproducibility — SHIPPED (2026-09-22)
`.github/workflows/build.yml` now rebuilds and commits `client/dist/` on Linux
after every push to `master`, eliminating cross-OS terser drift and stale
hand-built bundles.

### 🧪 Client component & async hook tests
Pure client modules (`iemRadar.js`, `mosaicSource.js`, `radialRender.js`,
`irEnhancement.js`, `stormArrival.js`, `alertLogic.js`, `embed.js`) are
covered by `node --test` suites and drift guards (`test/verbatimSync.test.js`,
`test/stableMapEvents.test.js`). React components and async polling hooks with
out-of-order responses still rely on Playwright verification rather than unit
tests.

### 🛠️ React 19 & ESLint 10 follow-ups
`eslint-plugin-react-hooks@7` surfaced `set-state-in-effect` findings to clean
up alongside bumping the plugin; ESLint 10 remains gated on
`eslint-plugin-react` declaring `eslint ^10` peer support.

### 📋 Lint `server/` and `test/`
ESLint currently runs inside the `client/` webpack builds (`npm run prod` and
`npm run app:build`). Adding a root flat config for `server/` and `test/`
would catch unused bindings in server-only files automatically.

### 🗂️ `AppContext.js` size
Carries seven context slices in one large file; split into dedicated providers
opportunistically when touching those slices.

---

*Last updated: 2026-11-17.*
