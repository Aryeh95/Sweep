# Home Assistant

Sweep can serve its nowcast and nearest-lightning readout to Home
Assistant on your network, so automations can react to rain minutes
before it arrives.

What HA gets, for the location saved in Sweep's Settings:

- whether it is raining (or snowing) at home now
- minutes until rain arrives, the likely range, and how likely it is
- when it should stop
- the nearest lightning within 50 mi: distance, direction, age
- how old the radar scan behind the answer is

Warnings are left out on purpose: Home Assistant's own **National
Weather Service** integration already covers them, from the same NWS
data.

## 1. Turn it on in Sweep

On the kiosk: **Settings → Advanced → Home Assistant → Rain and lightning
sensors: On.** The panel then shows the address to use, e.g.

```
http://192.168.1.50:8099/summary
http://surface.local:8099/summary
```

- It only works from the kiosk itself (like every settings change).
- It needs a **saved location** (Settings → Location). Without one the
  summary answers `"available": false, "reason": "no-home-location"`.
- This is a separate, read-only listener on port 8099, plain HTTP. It
  serves this one document and nothing else: no settings, no keys, no
  coordinates. The main app stays local-only; you do **not** need
  `ALLOW_REMOTE`.
- Give the Surface a fixed address (a DHCP reservation in your router) so
  the URL does not change. The `.local` name works too if HA resolves
  mDNS.
- If Ubuntu's firewall is on (`sudo ufw status` says `active`), allow HA:
  `sudo ufw allow from <HA's IP> to any port 8099 proto tcp`.

Check from any machine on the network:

```sh
curl http://192.168.1.50:8099/summary
```

## 2. Add the sensors to Home Assistant

Add to `configuration.yaml` (replace the address), then **Developer tools
→ YAML → Check configuration**, and restart Home Assistant.

```yaml
rest:
  - resource: http://192.168.1.50:8099/summary
    scan_interval: 60
    timeout: 30
    sensor:
      # One sensor carrying everything: its state is raining / arriving /
      # unclear / dry / unknown, every other value is an attribute.
      # Automations below read this one.
      - name: Sweep weather
        unique_id: sweep_weather
        icon: mdi:weather-pouring
        value_template: "{{ value_json.state }}"
        json_attributes:
          - raining
          - precip_type
          - intensity
          - rain_in_min
          - rain_in_min_earliest
          - rain_in_min_latest
          - rain_probability
          - rain_ends_in_min
          - lightning_mi
          - lightning_km
          - lightning_direction
          - lightning_age_min
          - lightning_flashes
          - radar_site
          - radar_age_min
          - nowcast_reason

      # Readable text for dashboard tiles: "25 min", "Raining now",
      # "No rain expected", "Not raining", "None within 50 mi", "7 mi NW".
      # "No data" means Sweep has no usable nowcast (e.g. radar delayed).
      - name: Sweep rain in
        unique_id: sweep_rain_in_min
        icon: mdi:timer-sand
        value_template: >-
          {%- set m = value_json.rain_in_min -%}
          {%- if value_json.state == 'unknown' -%}No data
          {%- elif m == 0 -%}Raining now
          {%- elif m is none -%}No rain expected
          {%- else -%}{{ m }} min{%- endif -%}
      - name: Sweep rain stops in
        unique_id: sweep_rain_ends_in_min
        icon: mdi:weather-partly-cloudy
        value_template: >-
          {%- set e = value_json.rain_ends_in_min -%}
          {%- if value_json.state == 'unknown' -%}No data
          {%- elif not value_json.raining -%}Not raining
          {%- elif e is none -%}Not in next {{ value_json.horizon_min or 90 }} min
          {%- else -%}{{ e }} min{%- endif -%}
      - name: Sweep rain chance
        unique_id: sweep_rain_probability
        unit_of_measurement: "%"
        icon: mdi:water-percent
        value_template: "{{ value_json.rain_probability }}"
        availability: "{{ value_json.rain_probability is not none }}"
      - name: Sweep nearest lightning
        unique_id: sweep_lightning_mi
        icon: mdi:flash
        value_template: >-
          {%- if not value_json.lightning_available -%}No data
          {%- elif value_json.lightning_mi is none -%}None within 50 mi
          {%- else -%}{{ value_json.lightning_mi | round(0) | int }} mi {{ value_json.lightning_direction }}{%- endif -%}

      # Numbers instead, for history graphs or numeric automations: use
      # e.g. value_template "{{ value_json.rain_in_min }}" with
      # unit_of_measurement: min and
      # availability: "{{ value_json.rain_in_min is not none }}".
      # Those read "Unavailable" whenever there is nothing to report.

    binary_sensor:
      - name: Sweep raining
        unique_id: sweep_raining
        device_class: moisture
        value_template: "{{ value_json.raining == true }}"
      - name: Sweep lightning within 10 mi
        unique_id: sweep_lightning_close
        device_class: safety
        value_template: "{{ value_json.lightning_mi is not none and value_json.lightning_mi <= 10 }}"
```

For metric, use `lightning_km` and write `km` in the nearest-lightning
template.

## 3. Example automations

Replace `notify.mobile_app_phone` with your phone's notify action
(**Developer tools → Actions**, search "notify").

```yaml
automation:
  - alias: Rain on the way
    triggers:
      - trigger: template
        value_template: >
          {{ is_state('sensor.sweep_weather', 'arriving')
             and (state_attr('sensor.sweep_weather', 'rain_in_min') or 999) <= 15
             and (state_attr('sensor.sweep_weather', 'rain_probability') or 0) >= 60 }}
    actions:
      - action: notify.mobile_app_phone
        data:
          title: Rain on the way
          message: >
            {{ state_attr('sensor.sweep_weather', 'intensity') | capitalize }}
            {{ state_attr('sensor.sweep_weather', 'precip_type') }} in about
            {{ state_attr('sensor.sweep_weather', 'rain_in_min') }} min
            ({{ state_attr('sensor.sweep_weather', 'rain_probability') }}% chance).

  - alias: Lightning close by
    triggers:
      - trigger: state
        entity_id: binary_sensor.sweep_lightning_within_10_mi
        to: "on"
    actions:
      - action: notify.mobile_app_phone
        data:
          title: Lightning nearby
          message: >
            Lightning {{ state_attr('sensor.sweep_weather', 'lightning_mi') }} mi
            {{ state_attr('sensor.sweep_weather', 'lightning_direction') }}.

  - alias: Skip watering when it is raining or about to
    triggers:
      - trigger: time
        at: "06:00:00"
    conditions:
      - condition: template
        value_template: >
          {{ not (is_state('sensor.sweep_weather', 'raining')
                  or (is_state('sensor.sweep_weather', 'arriving')
                      and (state_attr('sensor.sweep_weather', 'rain_probability') or 0) >= 60)) }}
    actions:
      - action: switch.turn_on
        target:
          entity_id: switch.sprinklers
```

The first automation fires once when the condition becomes true, not on
every poll. If rain keeps being pushed back and then returns, it can fire
again; add a `conditions:` block with a cool-down if that gets noisy.

## The fields

`GET /summary` returns flat JSON (every value a string, number, boolean
or null):

| field | meaning |
|---|---|
| `available` | false only when no location is saved (`reason`) |
| `state` | `raining`, `arriving`, `unclear` (echo nearby whose motion the scans do not agree on), `dry`, `unknown` (no usable nowcast) |
| `raining` | true / false; null when unknown |
| `precip_type` | `rain`, `snow`, `mix`, `hail`, `graupel`; `none` when dry |
| `intensity` | `light`, `moderate`, `heavy`, … (raining: now; arriving: the peak) |
| `rain_in_min` | 0 while raining, minutes until it arrives, null when dry |
| `rain_in_min_earliest` / `_latest` | the likely arrival range |
| `rain_probability` | %, of the arrival (or of raining now); when dry, the highest chance in the window |
| `rain_ends_in_min` | minutes until it stops, null when it does not within the window |
| `horizon_min` | how far ahead the nowcast looks (usually 90) |
| `nowcast_available` / `nowcast_reason` | why there is no answer: `delayed` (newest scan > 20 min old), `no-recent-scans`, `unavailable`, … |
| `radar_site` / `scan_time` / `radar_age_min` | the radar and scan behind the answer |
| `lightning_available` | false when the GLM feed failed |
| `lightning_km` / `lightning_mi` | nearest flash in the last 5 min within 80 km (50 mi); null when none |
| `lightning_direction` / `lightning_bearing_deg` | where it is, from home |
| `lightning_age_min` | how old that flash is |
| `lightning_flashes` | flashes within 80 km in the last 5 min |
| `updated` | when this answer was computed (cached 30 s) |

The answers follow the kiosk's nowcast card exactly (same scan, same
rules), so HA and the screen never disagree.

## Costs and limits

- HA polling once a minute keeps the nowcast and the lightning feed
  running even while the kiosk sleeps: about 1 MB a minute of lightning
  downloads (~1.4 GB a day) plus a radar scan every few minutes. Raise
  `scan_interval` to lower it.
- Each answer is cached 30 s; more than 30 requests a minute from one
  address are refused (429).
- The listener speaks plain HTTP because it carries nothing private. Do
  not forward port 8099 from your router; it is meant for your home
  network only.
