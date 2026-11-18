# Security Policy

## Overview

Sweep runs on a trusted local network as an always-on kiosk. This document
describes the security model, the protections in place, and the boundaries
of the threat model.

---

## API key protection

The only keyed upstreams are **Mapbox** (basemap tiles) and **LocationIQ**
(reverse geocoding). Both are called by the Express server; the keys live in
`settings.json` on the host and never appear in client-side URLs.
Everything radar-related (IEM, the NEXRAD Level III, MRMS, and GOES-19 S3
buckets, `api.weather.gov`, ECCC, `ipapi.co`) is keyless. Sunrise / sunset is
not fetched at all — it is computed locally in `server/solar.js`.

Remote clients receive booleans (`true` / `false`) for key fields from
`GET /settings`; key values are returned only to `localhost`.

---

## Access control

| Endpoint | Localhost | Remote (`ALLOW_REMOTE=true`) |
|---|:---:|:---:|
| `GET /` — app UI | ✅ | ✅ |
| `GET /api/*` — radar, satellite, alerts, tiles, geocoding, health | ✅ | ✅ |
| `GET /settings` — keys masked to booleans | ✅ | ✅ (masked) |
| `POST / PUT /settings`, `PATCH / DELETE /setting` | ✅ | ❌ always blocked |
| `POST /api/brightness`, `/api/display-scale`, `/api/relaunch-kiosk` | ✅ | ❌ always blocked |
| `POST /api/update`, `POST /api/update-check/force` | ✅ | ❌ always blocked |
| `GET /api/home-assistant`, `GET /api/radar/nowcast/skill` | ✅ | ❌ always blocked |
| `GET /api/debug*` | ✅ | ❌ always blocked |

Localhost is decided from the **socket peer address**
(`req.socket.remoteAddress`), never from `X-Forwarded-For` or `req.ip`.
Additionally, requests are protected against **DNS rebinding and cross-site
request forgery (CSRF)** via `Host` header validation and `Origin` /
`Sec-Fetch-Site` checks on state-changing routes, so a malicious web page
opened in a local browser cannot mutate settings or trigger updates.

There is no option to enable remote writes; use an SSH tunnel:

```bash
ssh -L 8443:localhost:8443 user@<kiosk-ip>
# then open https://localhost:8443
```

---

## Remote access

Disabled by default (`127.0.0.1` only). With `ALLOW_REMOTE=true`:

- keyed upstreams stay proxied; no key exposure
- writes, hardware controls, the updater, Home Assistant network status,
  per-pin nowcast skill history, and debug stay localhost-only
- rate limiting applies per socket peer (loopback peers are exempt via
  `skipLoopbackPeer` so the kiosk never throttles itself): 120 req/min on
  JSON routes, 600 req/min on map tiles, plus a 3-in-flight cap per remote
  peer on `/api/nearby-alerts` (which fans out to several NWS calls)
- `/api/health` redacts internal `host:port` strings for remote callers
- `showTest=1` on the alert endpoints is honoured for localhost only

---

## Opt-in Home Assistant HTTP bridge (`:8099`)

`server/haBridge.js` provides a **separate, opt-in plain-HTTP listener**
(default port `8099`, bound to all interfaces, **disabled by default** unless
`homeAssistant.enabled: true` is saved in `settings.json`):

- **Read-only (`GET` / `HEAD` only)** with its own 30 req/min per-peer rate
  limiter (`MAX_TRACKED_PEERS = 256`).
- `GET /summary` (and `/`) serves flat weather/nowcast/lightning JSON for the
  kiosk's saved home pin only — callers cannot supply coordinates, read API
  keys, or trigger writes, and home coordinates are omitted from the response.
- **Second opt-in (`homeAssistant.map: true`):** exposes `/embed` (the
  frameless map-only UI) by forwarding a strict GET-only path whitelist to
  the Express app as a **remote** client (subject to the main rate limiters
  and `localhostOnly` blocks) and answering `/settings` with a reduced copy
  (API keys masked to booleans, `favorites` and `homeAssistant` stripped).
  `X-Frame-Options` is removed and `Content-Security-Policy: frame-ancestors *`
  is set on this `:8099` listener only so Home Assistant dashboards can
  iframe `/embed`. See [`docs/home-assistant.md`](docs/home-assistant.md).

---

## Transport security

HTTPS on `:8443` with a self-signed root CA (`server/ca-cert.pem`,
`server/ca-key.pem` mode `0600`) and a leaf certificate (`server/cert.pem`,
`server/key.pem` mode `0600`) generated on first launch. The leaf's SAN
covers `localhost`, `127.0.0.1`, every active LAN IPv4, and the hostname; an
IP change re-signs the leaf under the same CA. `GET /api/cert.pem` serves
`ca-cert.pem` (as `sweep-cert.pem`) for trusting on other devices.
`SKIP_CERT_AUTOGEN=true` uses operator-supplied files. If no certificate can
be produced the server falls back to HTTP on `:8080` bound to the **loopback
interface (`127.0.0.1`) only**, even when `ALLOW_REMOTE=true`.

Security headers on every main-server response: `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Content-Security-Policy: frame-ancestors 'none'`; `X-Powered-By` removed.

---

## Settings file

`settings.json` is written atomically (temp file, fsync, rename, serialized
write queue), owned by the service user with mode `0600` (orphan temp files
swept at startup), and validated against a default-deny allow-list:
`mapApiKey`, `reverseGeoApiKey`, `startingLat`, `startingLon`, `radarSite`
(coerced to 3-letter NEXRAD ID or `""`), `homeAssistant` (coerced to
`{enabled, map, port}`), `favorites` (shape-validated, max 6), and
`advanced`. Legacy keys from removed forecast features (`weatherApiKey`,
`anthropicApiKey`, `airNowApiKey`, `openAqApiKey`, `indoorTemperature`) are
**rejected**, not accepted: unknown keys are stripped on `POST`/`PUT` (and
`GET /settings` remote projection) and rejected with HTTP `400` on `PATCH`.

---

## Update flow

`POST /api/update` is localhost-only, serialized with a single-flight lock,
refuses to run on a detached HEAD, a branch other than `master`, or a dirty
working tree, runs `git pull --ff-only` followed by `npm ci --omit=dev
--no-audit --no-fund`, and schedules a service restart. `git fetch` uses
whatever credentials the checkout already has; no tokens are stored by the
application.

---

## Security events

Blocked write and CSRF/rebinding attempts are logged and listed in the debug
panel (localhost only, `DEBUG=true`).

---

## Threat model and boundaries

Designed for a **trusted home LAN**. Not hardened for the public internet:

- self-signed certificate (browser warning on first visit)
- no authentication for remote read access (or on the opt-in `:8099` Home
  Assistant listener)
- `settings.json` stores keys in plain text on the host (`0600`)

For a kiosk in a semi-public place see
[`docs/security-hardening.md`](docs/security-hardening.md) (USB mass-storage
lockdown, virtual-terminal masking, outbound firewall, SSH hardening). If you
expose the server beyond your LAN, put an authenticating reverse proxy in
front of it.

---

## Reporting a vulnerability

Open a [GitHub issue](https://github.com/Aryeh95/sweep/issues)
with the label `security`, or contact the maintainer directly via GitHub
for sensitive disclosures.
