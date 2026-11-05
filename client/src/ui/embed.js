// Embed mode — the radar map alone, for a Home Assistant dashboard
// (webpage card) or any other iframe.
//
//   /embed?zoom=8&theme=dark&play=1&lightning=1
//
// Entered by the path `/embed` (how the Home Assistant bridge serves it)
// or `?embed=1` on any Sweep URL. What changes:
//   - only the map is drawn: no dock, header, panels, legend, timeline,
//     zoom buttons, settings, update prompt or screensaver; the
//     frame-age chip stays (staleness must stay visible), as do the
//     Mapbox attribution, the home pin and the press-and-hold readout;
//   - it never sleeps (a dashboard tile that stops updating looks like
//     current radar);
//   - it never WRITES: per-device preferences live in memory, seeded
//     from the URL rather than from this origin's localStorage, and any
//     non-GET request is refused before it leaves. An embed opened on
//     the kiosk's own origin therefore cannot change the kiosk's
//     settings or its saved map zoom.
//
// URL options (all optional):
//   zoom       map zoom (default: the kiosk's saved zoom)
//   theme      auto | dark | light (default auto: dark between sunset and sunrise)
//   play       1 = animate the radar loop (default: newest frame only)
//   lightning  1 = GLM lightning      tracks  1 = storm tracks
//   alerts     1 = warning polygons   satellite  ir | irc | vis
//   chip       0 = hide the frame-age chip
//   pin        0 = hide the home pin

const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);

/**
 * Read the embed options from a location.
 *
 * @param {{pathname: String, search: String}} loc window.location or a stand-in
 * @returns {{on: Boolean, zoom: Number|null, theme: String, play: Boolean,
 *   lightning: Boolean, tracks: Boolean, alerts: Boolean, satellite: String,
 *   chip: Boolean, pin: Boolean}}
 */
export function parseEmbed(loc) {
  const q = new URLSearchParams(loc && loc.search ? loc.search : "");
  const path = (loc && loc.pathname ? loc.pathname : "/").replace(/\/+$/, "");
  const flag = (name, dflt) => {
    const v = (q.get(name) || "").toLowerCase();
    if (TRUE.has(v)) return true;
    if (FALSE.has(v)) return false;
    return dflt;
  };
  const zoom = parseFloat(q.get("zoom"));
  const theme = (q.get("theme") || "auto").toLowerCase();
  const satellite = (q.get("satellite") || "off").toLowerCase();
  return {
    on: path === "/embed" || flag("embed", false),
    zoom: Number.isFinite(zoom) && zoom >= 2 && zoom <= 18 ? zoom : null,
    theme: ["auto", "dark", "light"].includes(theme) ? theme : "auto",
    play: flag("play", false),
    lightning: flag("lightning", false),
    tracks: flag("tracks", false),
    alerts: flag("alerts", false),
    satellite: ["ir", "irc", "vis"].includes(satellite) ? satellite : "off",
    chip: flag("chip", true),
    pin: flag("pin", true),
  };
}

export const EMBED = typeof window === "undefined"
  ? parseEmbed(null)
  : parseEmbed(window.location);

/**
 * The per-device preferences an embed starts from — the keys
 * AppContext reads from localStorage, as the strings it expects.
 *
 * @param {Object} e parseEmbed result
 * @returns {Object<String, String>}
 */
export function embedPrefs(e) {
  const prefs = {
    showNowcast: "false",
    showLightning: String(e.lightning),
    showStormTracks: String(e.tracks),
    showWeatherAlerts: String(e.alerts),
    showRadarSites: "false",
    satelliteMode: e.satellite,
    // The loop only runs while the timeline is "visible" (loopActive);
    // the timeline itself is never drawn in an embed.
    radarTimelineVisible: String(e.play),
    markerIsVisible: String(e.pin),
    // The kiosk's long-wavelength-red night palette is a bedside-screen
    // setting, not a dashboard one.
    sleepNightMode: "false",
    darkModeAuto: String(e.theme === "auto"),
  };
  if (e.theme !== "auto") prefs.darkMode = String(e.theme === "dark");
  if (e.zoom != null) prefs.defaultMapZoom = String(e.zoom);
  return prefs;
}

/**
 * A Storage that lives in memory only.
 *
 * @param {Object<String, String>} seed initial entries
 * @returns {Storage}
 */
export function memoryStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => { m.clear(); },
  };
}

/**
 * Switch the page into embed mode. Call before the first render, and
 * only when EMBED.on.
 *
 * @param {Object} axios the axios instance the client uses
 */
export function installEmbed(axios) {
  document.documentElement.setAttribute("data-embed", "true");
  try {
    const storage = memoryStorage(embedPrefs(EMBED));
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  } catch {
    // A browser that refuses the swap keeps its real storage; the embed
    // still draws, it just starts from this origin's saved preferences.
  }
  axios.interceptors.request.use((config) => {
    const method = String(config.method || "get").toLowerCase();
    if (method !== "get" && method !== "head") {
      return Promise.reject(new Error(`embed is read-only (${method} ${config.url})`));
    }
    return config;
  });
}
