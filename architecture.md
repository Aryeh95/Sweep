# Sweep — Software Architecture

*Current as of the November 2026 radar build. The forecast-dashboard
architecture this project was cut from is preserved in
[`docs/archive/`](docs/archive/).*

---

## 1. Context and objectives

Sweep is a self-hosted NEXRAD radar viewer: a small Node/Express server and a
React + Leaflet client that fill an always-on kiosk screen — and also build
into a serverless standalone Android APK — with a two-layer radar view,
precipitation-type and rainfall-accumulation modes, GOES-East satellite
imagery, storm-cell tracks, GLM lightning, NWS alert polygons, and an
ensemble point nowcast, with the age of every layer spelled out on the map.
Model forecasting is deliberately out of scope.

### Target use cases

1. **Always-on kiosk** in a home, operated by touch or not at all. The browser
   runs in kiosk mode, the server starts at boot (`systemd` on Linux, `launchd`
   on macOS), and the device needs no attention after setup. The reference
   deployment is a Surface Pro on Ubuntu; Raspberry Pis and other Linux
   desktops work the same way.
2. **Standalone Android app** (`app/` + `client/src/standalone/`), running the
   server's own controllers inside a Capacitor WebView against the public
   CORS-open upstreams with no backend server or VPN required.
3. **Home Assistant integration** (`server/haBridge.js`), an opt-in read-only
   plain-HTTP listener on `:8099` serving `/summary` JSON and an optional
   frameless `/embed` map view for dashboards.

### Quality attributes

| Attribute | Target | How it is addressed |
|---|---|---|
| **Honest freshness** | Staleness is visible, never suspected | Every layer's data time is polled and shown; thresholds encode NEXRAD's 4–6 min scan floor; failing pollers flag rather than freeze; MRMS mosaic falls back automatically to IEM N0Q when > 10 min stale |
| **Availability** | 24/7 unattended | `systemd` `Restart=on-failure`; transient S3 retry (`s3Get.js`); disk caches for geolocation, counters, and nowcast skill; `ExecStartPre` waits for DNS |
| **Upstream courtesy** | Minimal traffic to free public sources | Server-side shared caches sized to each product's cadence; all pollers pause while the screensaver is up or the document is hidden (except the 2-min point-alert poll when wake-for-warnings is armed) |
| **Security** | Keys never leave the host; mutations localhost-only | Mapbox and LocationIQ proxied; remote clients get masked booleans; socket-peer locality + `Host`/`Origin`/`Sec-Fetch-Site` CSRF/rebinding guards; loopback exempt from rate limits |
| **Maintainability** | Deployable with `git pull` | CI (`build.yml`) rebuilds and commits `client/dist/` on Linux and publishes signed release APKs; in-app updater runs pre-flight checks + `npm ci` |
| **Cross-distro portability** | Pi OS, Debian/Ubuntu, openSUSE, macOS | `install.sh` detects package manager, browser family and desktop environment, pinning `WorkingDirectory` via a drop-in |

---

## 2. System view

```
                     ┌─────────────────┐            ┌──────────────────────┐
                     │ Browser (LAN)   │            │ Home Assistant (LAN) │
                     └────────┬────────┘            └──────────┬───────────┘
                              │ ALLOW_REMOTE=true              │ opt-in HTTP :8099
                              │ HTTPS :8443                    │ (/summary, /embed)
┌──────────────────┐          │                     ┌──────────▼───────────┐
│ Kiosk browser    │ loopback │  ┌──────────────────┤   haBridge.js        │
│ (Chromium/Firefox├──────────┼─►│  Express server  ◄──────────────────────┘
└──────────────────┘          └─►│  (server/index)  │  (read-only whitelist)
        ▲                        │                  │
        │ IEM / GOES vis tiles   │  /settings (writes: localhost only)
        │ direct (CORS *)        │  /api/tiles/*              → Mapbox proxy
        │                        │  /api/radar/site,frames    → IEM + NWS
        │                        │  /api/radar/status         → NWS WSR-88D feed
        │                        │  /api/radar/radial         → L3 N0B/N0G/N0C/PTYPE/DAA/DU3/DTA
        │                        │  /api/radar/refl-mosaic*   → MRMS RALA (IEM fallback)
        │                        │  /api/radar/precip-mosaic  → MRMS PrecipFlag × Rate
        │                        │  /api/radar/qpe-mosaic     → MRMS 1h / 3h QPE
        │                        │  /api/radar/nowcast*       → Lagrangian ensemble
        │                        │  /api/satellite/ir/*       → GOES-19 CMIP C13
        │                        │  /api/storm-tracks         → L3 STI + NMD + MRMS MESH
        │                        │  /api/lightning            → GOES-19 GLM HDF5
        │                        │  /api/weather-alerts, nearby-alerts → NWS / ECCC
        │                        └──────────┬───────────────────────────────────
        │                                   │ Internet (s3Get single retry on S3)
   ┌────┴─────────┐   ┌─────────────────────┼──────────────┬───────────────────┐
   │ IEM tile.py  │   │ unidata-nexrad-     │ noaa-mrms-pds│ noaa-goes19 (S3)  │
   │ N0Q fallback │   │ level3 (S3)         │ (S3) RALA,   │ GLM + ABI C13 ·   │
   │ ridge:: N0B  │   │ N0B N0G N0C N0H     │ MESH, Flag,  │ api.weather.gov · │
   │ GOES vis     │   │ DAA DU3 DTA NST NMD │ Rate, QPE    │ ECCC · Mapbox     │
   └──────────────┘   └─────────────────────┴──────────────┴───────────────────┘
```

- **Kiosk browser** talks to the server over loopback (`skipLoopbackPeer`
  exempts it from rate limits), granting settings writes, debug, brightness,
  display-scale relaunch, and the in-app updater.
- **Remote browsers** (`ALLOW_REMOTE=true`) get a read-only HTTPS view.
- **Home Assistant bridge** (`:8099`, opt-in) serves `/summary` (flat JSON for
  the saved home pin, no coordinates exposed) and, behind a second opt-in
  (`homeAssistant.map`), `/embed` (frameless map UI over a strict GET
  whitelist).
- **Standalone Android app** (`app/`) bundles the React client together with
  the server controllers via a custom `axios` adapter (`client/src/standalone/`),
  calling the public CORS-open S3/IEM/NWS endpoints directly from the WebView.

---

## 3. Server

`server/index.js` bootstraps Express, generates or loads the TLS CA + leaf
certificate chain, wires the routes, security headers, CSRF/rebinding guards
and rate limiters, starts the optional Home Assistant bridge, and hosts the
`POST /api/update` flow.

```
server/
  index.js              routes, TLS CA+leaf, rate limits, update flow, timestamped console
  haBridge.js           opt-in plain-HTTP :8099 listener (/summary + /embed whitelist)
  homeSummary.js        flat JSON reducer mirroring NowcastPanel rules for Home Assistant
  settingsCtrl.js       settings.json: allow-list, sanitizers, masking, serialized 0600 writes
  proxyCtrl.js          Mapbox tiles, LocationIQ reverse geocode, sunrise / sunset
  solar.js              local NOAA solar position: sunrise, sunset, civil twilight
  geolocationCtrl.js    ipapi.co default location, 30-day disk cache
  s3Get.js              single-retry axios wrapper for NOAA / Unidata S3 buckets
  iemRadarCtrl.js       /api/radar/site (override → IEM nearest → NWS) + /api/radar/frames
  radarStatusCtrl.js    /api/radar/status — NWS WSR-88D latency / operability classifier
  nexradBucket.js       hour-prefixed S3 listing & timestamp matching for Level III
  radarRadialCtrl.js    /api/radar/radial — N0B, N0G, N0C, PTYPE (N0H×N0B), DAA, DU3, DTA;
                        server-side dual-pol clean mask + class-aware floor + CC ≥ 0.85 gate
  precipType.js         shared CJS class/intensity encoding and colour LUTs (server + client)
  accumulation.js       shared CJS geometric QPE depth ladder and LUTs (server + client)
  mrmsHailCtrl.js       pure-JS GRIB2 PNG-packing decoder + MRMS MESH 2-min / 30-min swath
  mrmsReflCtrl.js       /api/radar/refl-mosaic* — MRMS RALA 1 km low-zoom mosaic + frames
  mrmsPrecipTypeCtrl.js /api/radar/precip-mosaic — MRMS PrecipFlag × PrecipRate 2 km RLE
  mrmsQpeCtrl.js        /api/radar/qpe-mosaic — MRMS RadarOnly_QPE_01H / _03H 2 km RLE
  goesIrCtrl.js         /api/satellite/ir/* — GOES-19 ABI C13 CMIP HDF5 → McIDAS counts
  stormTracksCtrl.js    /api/storm-tracks — STI (58) cells + NMD (141) mesos + TDS debris + MESH
  nowcastCtrl.js        /api/radar/nowcast + /skill — 25-member Lagrangian ensemble + live skill
  warningWake.js        shared CJS wake-for-warnings + quiet-hours filter
  nearHome.js           shared CJS active home warnings + nearest GLM flash helper
  glmLightningCtrl.js   /api/lightning — GOES-19 GLM HDF5 via h5wasm, rolling 5-min window
  govAlertsCtrl.js      /api/weather-alerts (60 s NWS cache) + /api/nearby-alerts
  govAlertSources/      nws.js, eccc.js, nwsZones.js, _shared.js
  healthCtrl.js         /api/health classifier over serviceStatus (+ recovery tracking)
  updateChecker.js      tracked-branch git fetch/compare, deploy-file SHA drift check
  brightnessCtrl.js · displayScaleCtrl.js · debugCtrl.js
  boundedCache.js · singleFlight.js · serviceStatus.js · requestCounter.js
  responseTimer.js · clientTracker.js · securityHeaders.js · rateLimitKey.js
```

---

## 4. Client and Standalone App

React 19 + react-leaflet 5, bundled by webpack 5 into two targets:

- `webpack.config.js` → `client/dist/` (committed kiosk/web bundle; rebuilt on
  Linux by `.github/workflows/build.yml` on every push to `master`).
- `webpack.app.config.js` → `client/dist-app/` (`__STANDALONE__ = true`,
  bundling `client/src/standalone/` + `server/*` controllers with `pako`/`buffer`
  shims for Capacitor Android in `app/`).

```
client/src/
  AppContext.js                 settings, location, prefs, alerts, radar state,
                                warningHold + sleep stage → pollingPaused
  ui/embed.js                   /embed (?embed=1) isolated in-memory Storage + GET-only guard
  standalone/                   Android in-process API adapter, localStorage settingsStore,
                                keyless Esri / optional pk. Mapbox upstream, Node shims
  components/AmbientLayers      layout shell (desktop / Pi / mobile / LayoutEmbed)
  components/ambient/           RadarHeader, LocateButton, AppDrawer, BottomDock +
                                ControlButtons (withHint), AlertBanner + NowcastPanel,
                                LocationPicker, SettingsPanel, DebugPanel, HealthIndicator, …
  components/WeatherMap/
    index.js                    MapContainer (zoomSnap: 0), layer orchestration, playhead
    useStableMapEvents.js       ref-backed Leaflet event binding (replaces useMapEvents)
    mosaicSource.js             MRMS RALA readiness + automatic IEM N0Q fallback + reflDbzAt
    PrecipMosaicLayer.js        viewport ImageOverlay for MRMS RALA (max-pyramid), PTYPE, QPE
    ColorIrLayer.js + irEnhancement.js   client-projected GOES-19 C13 gray & color-IR layers
    RadarSitePicker.js + radarSites.js   WSR-88D chips, 200 km sticky home site, offline red state
    MapProbe.js                 hover / press-and-hold multi-layer readout + "Set home here"
    useRadarRadial.js + useRadarRadialLoop.js + radialRender.js
    FilteredTileLayer.js · StormTracks.js · LightningOverlay.js · RadarTimeline.js · RadarLegend.js
```

### Key client mechanisms

- **Two-layer radar with resilient mosaic.** Low zoom (`z ≤ 7`, fading `8 → 9`)
  renders MRMS `ReflectivityAtLowestAltitude` (`PrecipMosaicLayer kind="refl"`
  with block-max pyramid downsampling when zoomed out) and switches
  automatically to versioned IEM N0Q tiles if MRMS fails or exceeds 10 min
  age. High zoom (`z ≥ 8`, alone `z ≥ 9`) renders raw Level III radials
  gate-by-gate on a 2560 px canvas (`N0B`, `N0G`, `N0C`, `PTYPE`, `DAA`,
  `DU3`, `DTA`), with IEM `ridge::` tiles as progressive fallback for `N0B`.
- **Three-state noise filter.** `off` → `dbz` (15 dBZ LUT floor on radials and
  `FilteredTileLayer`) → `clean` (default: server-side `N0H` hydrometeor mask
  with class-aware 15 dBZ floor on unclassified gates plus `N0C` `CC ≥ 0.85`
  gating on `IC`/`DS` to strip high-altitude bird blooms while preserving
  light rain and real snow, holding the last clean scan up to 10 min while
  `N0H` arrives).
- **Satellite & loop.** Dock cycles `off → ir → irc → vis`. Both IR modes
  decode NOAA GOES-19 channel-13 CMIP brightness counts and step in sync with
  the radar playhead; visible uses IEM `goes_east_conus_ch02` tiles.
- **Interactive probe & location pinning.** Hovering (mouse) or
  pressing-and-holding (touch) samples site radial, MRMS mosaic, and IR cloud
  top together (`MapProbe`). Right-clicking or lifting a touch hold pins the
  readout, exposing a two-step **"Set home here"** action alongside Settings →
  Location → **Choose on map** (`LocationPicker`). Plain map taps only open
  alert popups.
- **Idle & warning-wake.** `pollingPaused` (`sleepStage > 0 || document.hidden`)
  halts every poller except the 2-minute home-point alert check when
  `wakeWarnings` is enabled (`severe` or `tornado`, narrowed to `tornado` in
  `quietHours`); an active warning asserts `warningHold`, waking the screen to
  stage 0 and holding it awake until the warning expires.

---

## 5. CI/CD and Deployment

- **`.github/workflows/ci.yml`** runs the server/unit test suite, verifies
  `docs/localization-glossary.md` (`--check`), builds both `npm run prod`
  (`client/dist`) and `npm run app:build` (`client/dist-app`), and verifies
  `client/dist` file-set reproducibility.
- **`.github/workflows/build.yml`** runs on pushes to `master`: rebuilds and
  commits `client/dist` on Linux (rebasing cleanly on concurrent pushes), then
  builds, signs, verifies, and publishes `Sweep-<version>.apk` to the
  `app-v<versionName>` GitHub Release when the four `ANDROID_*` signing
  secrets are configured.

```
~/.config/systemd/user/
  pi-weather-server.service              main unit (untouched mirror of deploy/)
  pi-weather-server.service.d/
    override.conf                        WorkingDirectory=$REPO_DIR, log redirect, DEBUG
    local.conf                           ALLOW_REMOTE=true
    nvm.conf                             optional nvm sourcing (32-bit Bullseye)
~/.local/bin/{start-server,detect-display-scale.sh}
~/.config/pi-weather-station/browser.conf   BROWSER_CMD, BROWSER_FAMILY, DISPLAY_SCALE
~/.local/state/pi-weather-station/{server.log,kiosk.log,nowcast-skill.json}
Autostart: ~/.config/labwc/autostart · wayfire.ini · LXDE-pi/autostart · XDG *.desktop
macOS: ~/Library/LaunchAgents/com.pi-weather-station.plist
```

---

## 6. Architecture decision records

- **ADR-01 — Keyed upstreams proxied server-side; keyless tiles direct.**
  Mapbox and LocationIQ stay on the server; IEM radar/visible tiles load
  directly in Leaflet.
- **ADR-02 — `client/dist/` built and committed by CI.** Kiosks update via
  `git pull` with no build step; `build.yml` keeps the committed bundle
  byte-consistent with Linux `master`.
- **ADR-03 — Raw Level III radials + MRMS GRIB2 decoded in pure JS.** Product
  153/154/161/173 shims over `nexrad-level-3-data`, zlib PNG unpacking for
  MRMS, and `h5wasm` for GOES-19 GLM/CMIP avoid native/Python sidecars —
  which also lets every controller run unchanged inside the Android WebView.
- **ADR-04 — Frame age is a first-class UI element.** Every visible layer
  reports its true scan/valid age (`< 6` fresh, `6–12` aging, `≥ 12` min
  stale), and stale MRMS hands off automatically to IEM.
- **ADR-05 — Pollers pause on idle, except warning-wake.** Saves upstream
  bandwidth overnight while still waking the display within one 2-min poll of
  a Tornado or Severe Thunderstorm Warning.
- **ADR-06 — HTTPS CA + leaf on `:8443`; opt-in read-only HTTP bridge on `:8099`.**
  Main UI/API stays encrypted with transparent leaf rotation under a 10-year
  local CA; Home Assistant gets a tightly-scoped plain-HTTP listener that
  exposes no keys, writes, or home coordinates on `/summary`.
