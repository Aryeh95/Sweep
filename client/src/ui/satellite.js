/* GOES-East satellite overlay: the three settings the dock button cycles,
 * shared by the context that stores the choice, the map that draws it and
 * the age chip that reports it.
 *
 *   off  no satellite layer
 *   ir   channel 13 (clean longwave infrared, 2 km) — clouds by their
 *        top temperature, so it works day AND night; the default
 *   irc  the same channel colour-enhanced by cloud-top temperature
 *        (cyan from −20 °C to pink below −80 °C) — see ui/irEnhancement.js
 *   vis  channel 02 (red visible, 0.5 km) — the sharpest cloud picture
 *        while the sun is up, black after dark
 *
 * Visible is IEM's `goes_east_conus_ch02` tile layer (same host and the
 * same keyless XYZ scheme as the radar). Both infrared modes are drawn
 * client-side from brightness counts decoded from NOAA's CMIP files (live
 * and loop alike), so they animate; visible shows the current scan only.
 * Valid times come from IEM's per-channel JSON sidecar, relayed by
 * /api/radar/frames as `satellite`.
 */
export const SATELLITE_MODES = ["off", "ir", "irc", "vis"];
export const SATELLITE_DEFAULT = "off";

const IEM_TILE_BASE = "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0";

// Native detail per channel, as a Leaflet maxNativeZoom. Channel 13 is a
// 2 km product (~z9 at 40°N) and channel 02 is 0.5 km (~z11); asking
// deeper only costs requests for a picture that cannot get sharper.
// `channel` names the /api/radar/frames `satellite` entry holding the
// mode's valid time. The infrared modes have no `layer`: they are drawn
// client-side from brightness counts (ColorIrLayer), not from IEM tiles.
export const SATELLITE_LAYERS = {
  ir: { layer: null, maxNativeZoom: 9, channel: "ir" },
  irc: { layer: null, maxNativeZoom: 9, channel: "ir" },
  vis: { layer: "goes_east_conus_ch02", maxNativeZoom: 11, channel: "vis" },
};

/**
 * Leaflet URL template for a satellite mode.
 *
 * @param {String} mode satellite mode
 * @returns {String|null} tile URL template; null for "off", the infrared
 *   modes (not tile layers) and unknown modes
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
