/* GOES-East satellite overlay: the three settings the dock button cycles,
 * shared by the context that stores the choice, the map that draws it and
 * the age chip that reports it.
 *
 *   off  no satellite layer
 *   ir   channel 13 (clean longwave infrared, 2 km) — clouds by their
 *        top temperature, so it works day AND night; the default
 *   irc  the same channel colour-enhanced by cloud-top temperature
 *        (cyan from −20 °C to pink below −80 °C), drawn client-side by
 *        ColorIrLayer from IEM's raw scan — see ui/irEnhancement.js
 *   vis  channel 02 (red visible, 0.5 km) — the sharpest cloud picture
 *        while the sun is up, black after dark
 *
 * Tiles are IEM's `goes_east_conus_chNN` layers (same host and the same
 * keyless XYZ scheme as the radar), cut from the current CONUS scan and
 * refreshed every 5 min; the valid time comes from IEM's per-channel
 * JSON sidecar, relayed by /api/radar/frames as `satellite`.
 */
export const SATELLITE_MODES = ["off", "ir", "irc", "vis"];
export const SATELLITE_DEFAULT = "off";

const IEM_TILE_BASE = "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0";

// Native detail per channel, as a Leaflet maxNativeZoom. Channel 13 is a
// 2 km product (~z9 at 40°N) and channel 02 is 0.5 km (~z11); asking
// deeper only costs requests for a picture that cannot get sharper.
// `channel` names the /api/radar/frames `satellite` entry holding the
// mode's valid time. `irc` has no `layer`: it is not an IEM tile layer.
export const SATELLITE_LAYERS = {
  ir: { layer: "goes_east_conus_ch13", maxNativeZoom: 9, channel: "ir" },
  irc: { layer: null, maxNativeZoom: 9, channel: "ir" },
  vis: { layer: "goes_east_conus_ch02", maxNativeZoom: 11, channel: "vis" },
};

// IEM's raw channel-13 scan for the colour-enhanced mode: paletted PNG of
// brightness counts plus its world file, on the GOES-East fixed grid
// (sub-satellite longitude IR_IMAGE_LON0). Same GOES-19 filename caveat as
// SATELLITE_META_URLS in server/iemRadarCtrl.js — move both together.
export const IR_IMAGE_BASE = "https://mesonet.agron.iastate.edu/data/gis/images/GOES/conus/channel13/GOES-19_C13";
export const IR_IMAGE_LON0 = -75;

/**
 * Leaflet URL template for a satellite mode.
 *
 * @param {String} mode "ir" or "vis"
 * @returns {String|null} tile URL template, or null for "off", "irc" (not
 *   a tile layer) and unknown modes
 */
export function satelliteTileUrl(mode) {
  const def = SATELLITE_LAYERS[mode];
  return def && def.layer ? `${IEM_TILE_BASE}/${def.layer}/{z}/{x}/{y}.png` : null;
}

/**
 * The `satellite` metadata key for a mode's valid time.
 *
 * @param {String} mode satellite mode
 * @returns {String|null} "ir" / "vis", or null for "off"/unknown
 */
export function satelliteChannel(mode) {
  const def = SATELLITE_LAYERS[mode];
  return def ? def.channel : null;
}

/**
 * Coerce a stored preference to a known mode.
 *
 * @param {*} value localStorage contents
 * @returns {String} one of SATELLITE_MODES
 */
export function normalizeSatelliteMode(value) {
  return SATELLITE_MODES.includes(value) ? value : SATELLITE_DEFAULT;
}
