# Sweep on Android

The kiosk build is a browser talking to `server/index.js` over the LAN, which
is why the phone needed a VPN to see radar from anywhere. The Android app has
no server: it carries the same client bundle plus the server's own controllers,
and calls the upstream services directly from the WebView.

That works because every source this project uses is public, keyless and
CORS-open. Verified 2026-09-03, all answering `Access-Control-Allow-Origin: *`:

| Upstream | Serves |
| --- | --- |
| `mesonet.agron.iastate.edu` | IEM radar JSON API, fallback N0Q mosaic + single-site tiles, GOES visible tiles + metadata |
| `api.weather.gov` | radar station fallback, WSR-88D operational status, alerts, place name |
| `unidata-nexrad-level3.s3.amazonaws.com` | raw N0B / N0G / N0C / N0H radials, DAA / DU3 / DTA accumulation, STI storm tracks + NMD mesos, nowcast scans |
| `noaa-mrms-pds.s3.amazonaws.com` | MRMS RALA reflectivity mosaic, MESH hail, surface precip type + rate, 1 h / 3 h radar-only QPE |
| `noaa-goes19.s3.amazonaws.com` | GLM lightning, GOES-19 channel-13 CMIP infrared scans (live + loop) |
| `server.arcgisonline.com` / `api.mapbox.com` | basemap: keyless Esri Canvas by default, or 512 px Mapbox raster tiles with an optional per-device `pk.` token |

## How the server runs inside the app

`client/src/standalone/` is the whole of it:

- **`api.js`** imports the real controllers (`server/iemRadarCtrl.js`,
  `radarStatusCtrl.js`, `goesIrCtrl.js`, `radarRadialCtrl.js`,
  `mrmsReflCtrl.js`, `mrmsPrecipTypeCtrl.js`, `mrmsQpeCtrl.js`,
  `stormTracksCtrl.js`, `nowcastCtrl.js`, `glmLightningCtrl.js`,
  `govAlertsCtrl.js`) and runs them **verbatim** behind an Express-shaped
  `req`/`res` pair. They were already portable: `axios` works in a browser and
  the only Node built-ins in the set are `zlib` calls plus `fs`/`path` in
  best-effort caches.
- **`install.js`** swaps the axios *adapter*, so every existing
  `axios.get("/api/...")` in the hooks is answered in-process with no hook or
  component changed. The controllers' own upstream calls use absolute URLs and
  fall through to the real network adapter.
- **`upstream.js`** replaces the three routes that existed only because the
  server held a key or a socket — reverse geocoding (now the city/state that
  `api.weather.gov/points` already returns beside the radar station) and the
  IP-geolocation fallback — plus the keyless basemap URL. Sunrise / sunset
  needs no replacement: `server/proxyCtrl.js` computes it locally, so the
  app imports that handler and runs the same code the kiosk does.
- **`settingsStore.js`** backs `GET /settings`, `PATCH /setting` and
  `POST /settings` with localStorage, so the Advanced controls and saved
  places persist on the device instead of appearing editable and losing every
  change on relaunch.
- **`shims/`** supplies `zlib` (via pako, because the decoders need
  *synchronous* inflate and `DecompressionStream` is async-only), a no-op
  `fs`/`path`, and static product/packet tables for the Level III library,
  which otherwise builds them with `fs.readdirSync` at import time.

Reusing the controllers rather than reimplementing them is deliberate: the
product-153/154 shim, the MOVEMENT-is-a-FROM-direction handling, the 8-bit vs
16-bit MRMS split and the ±150 s frame-to-key matching all took live debugging
to get right, and a parallel copy would drift on the platform where those bugs
are hardest to observe. The server test suite covers the app's data path.

## Differences from the kiosk

| | Kiosk | App |
| --- | --- | --- |
| Data | `server/index.js` over LAN | in-process, direct to upstreams |
| Basemap | Mapbox via server proxy (key) | Esri Canvas (keyless), or optional user `pk.` Mapbox token |
| Place name | LocationIQ (key) | `api.weather.gov` point metadata |
| Position | server IP lookup / map picker | device GPS (locate + follow), map picker, IP fallback |
| Controls | dock along the bottom | collapsible left sidebar rail + hamburger drawer |
| Header | place + clock + date | hamburger + place + one-shot locate button |
| Zoom buttons | shown | hidden (pinch) |
| Settings | 3 sections (Local, server API & coords, Advanced) | 3 sections (Local + Location picker, optional `pk.` Mapbox token, Advanced) |
| Settings store | `settings.json` on the server | this device's `localStorage` |

No API keys are required, and none ship in the APK.

### A caution about "keyless"

The first attempt used CARTO's basemaps, which answer **HTTP 200 with a
normal-looking PNG whose pixels carry an "API KEY REQUIRED" watermark**. A
status-code check said keyless; the map said otherwise. Esri's Canvas tiles
have a quieter version of the same trap — above z16 they return 200 with a
JPEG reading "Map data not yet available", which is why the layer is capped
with `maxNativeZoom: 16` and upscales beyond it.

Whenever a tile source is swapped, look at the tiles.

### How the 3 Settings sections adapt in the app

1. **Local** — language, font size, dark mode, clock, units, alert display
   toggles, keep-screen-on (`keepScreenAwake`), **Location** with the
   interactive **"Choose on map"** modal picker (`LocationPicker`, alongside
   pinned-readout "Set home here", one-shot locate, and follow mode), and the
   manual radar-site override.
2. **API (Mapbox Basemap)** — instead of server `settings.json` keys, holds an
   **optional device-local public Mapbox token** (`pk.` only, `styles:tiles`
   scope; `sk.` secret tokens are refused). When set, the app switches from
   256 px Esri Canvas tiles to 512 px Mapbox raster tiles.
3. **Advanced** — radar opacity, reflectivity palette (`radarscope` / `nws`),
   alert survey radius, and — once a usable `pk.` Mapbox token is entered —
   the light and dark **Mapbox basemap style pickers**. Kiosk-only controls
   with no meaning on a phone ("Trust this Pi", mouse-pointer hiding,
   display-scale/brightness, the Sleep/screensaver group, the Home Assistant
   bridge, and the server Diagnostics row) stay hidden.

## Building

Because `webpack.app.config.js` bundles `server/*` controllers directly, both
the root and `client/` dependencies must be installed before building the APK:

```bash
npm ci               # root deps (nexrad-level-3-data, h5wasm, axios, …)
cd client && npm ci  # client + webpack deps
cd ../app && npm ci  # Capacitor CLI + Android platform
npm run apk          # builds client/dist-app, syncs Capacitor, assembles debug APK
```

The APK lands at `app/android/app/build/outputs/apk/debug/app-debug.apk`.
`npm run build:web` alone rebuilds `client/dist-app/` (the app bundle, kept
separate from the committed kiosk `client/dist/`).

Requires a JDK and the Android SDK; point `ANDROID_HOME` at the SDK and write
`sdk.dir=` into `app/android/local.properties`.

### Signing, and the sideload warnings

```bash
npm run apk:release   # signed, non-debuggable, ~4.8 MB
```

Android shows a sideloaded app several warnings, and they have different
causes — only some are fixable:

| Warning | Cause | Fixable |
| --- | --- | --- |
| "Install unknown apps" permission | Sideloading at all; granted per source app | No — one grant per source |
| Play Protect "unknown developer" | Google has never seen this signing certificate | Not outside a store |
| Extra scan / "unsafe app" friction | Debug certificate + `android:debuggable` | **Yes — build release** |
| "Built for an older version of Android" | Low `targetSdkVersion` | Already current (36) |

`assembleDebug` signs with `CN=Android Debug` — the certificate every debug
build on earth shares — and marks the app debuggable, which is the
combination Play Protect treats most suspiciously. A release build carries
the project's own certificate and drops the debuggable flag, which is the
mildest install path available without publishing. The prompt does not
disappear entirely: "unknown developer" is about Google not recognising the
certificate, and only distribution through a store (a Play internal-testing
track is enough) removes it.

**The keystore is the app's identity.** Android upgrades an installed app in
place only when the new APK carries the *same* key, so keep
`app/android/app/sweep-release.jks` backed up. Both it and
`keystore.properties` are gitignored — a signing key never belongs in a
repository. To make your own instead:

```bash
keytool -genkeypair -v -keystore app/android/app/sweep-release.jks \
  -alias sweep -keyalg RSA -keysize 4096 -validity 10950
cat > app/android/app/keystore.properties <<EOF
storeFile=sweep-release.jks
storePassword=<the store password>
keyAlias=sweep
keyPassword=<the key password>
EOF
```

Switching to a different key means uninstalling the old app first — the
install will otherwise fail with a signature mismatch. `assembleRelease`
without these files still builds; it just produces an unsigned APK rather
than failing the build.

## Updating the app

The app has no self-updater — the kiosk's update button is stubbed out, since
there is no checkout to pull. Rebuild the APK and reinstall over the top; the
package name is unchanged so it upgrades in place and keeps its preferences,
**provided the new APK is signed with the same key**.
