// Runtime patches to Leaflet, installed once at map module load.
//
// GridLayer.redraw() at a fractional zoom (Leaflet 1.9.4)
// ------------------------------------------------------
// `TileLayer.setUrl()` — what react-leaflet calls when a `url` prop
// changes, i.e. on every dark ↔ light basemap switch — goes through
// `GridLayer.redraw()`, which sets the layer's tile zoom from the map's
// zoom WITHOUT rounding:
//
//     var tileZoom = this._clampZoom(this._map.getZoom());
//
// Every other path (`_setView`, used by pan / zoom / add) rounds first.
// With `zoomSnap: 0` the map is almost always on a fractional zoom, so a
// theme flip created a tile level at zoom 7.676…, requested
// `/api/tiles/streets-v12/6.676380220353304/29/38` (measured 2026-09-28),
// and drew whatever the server returned for that in a grid scaled by
// 2^0.676. On the kiosk: a uniform patch of ocean-blue where the map was,
// and the radar tiles shrunk into a corner. It recovers on the next pan or
// zoom, because those go through `_setView`.
//
// The fix mirrors `_setView`'s own zoom resolution — round, refuse levels
// outside min/max, clamp to the native range — and otherwise keeps
// `redraw()` byte-for-byte. `redrawTileZoom` is pure so the rule is
// testable without a DOM.

/**
 * The tile zoom a grid layer should use after `redraw()`, resolved the
 * way `_setView` resolves it: the map zoom rounded to a whole level,
 * `undefined` when that level is outside the layer's min/max zoom (the
 * layer then draws nothing, as it does after a `_setView` there), else
 * clamped to the layer's native range.
 *
 * @param {Number} mapZoom current map zoom, possibly fractional
 * @param {{minZoom: Number=, maxZoom: Number=}} options layer options
 * @param {Function} clampZoom the layer's `_clampZoom` (min/max native zoom)
 * @returns {Number|undefined}
 */
export function redrawTileZoom(mapZoom, options, clampZoom) {
  const tileZoom = Math.round(mapZoom);
  if ((options.maxZoom !== undefined && tileZoom > options.maxZoom)
    || (options.minZoom !== undefined && tileZoom < options.minZoom)) {
    return undefined;
  }
  return clampZoom(tileZoom);
}

/**
 * Replace `GridLayer.prototype.redraw` with a version that rounds the
 * tile zoom. Idempotent: installing twice leaves one patch.
 *
 * @param {Object} L the Leaflet namespace
 * @returns {Boolean} true when the patch was installed by this call
 */
export function installGridLayerRedrawPatch(L) {
  const proto = L && L.GridLayer && L.GridLayer.prototype;
  if (!proto || proto.redraw.__sweepRoundsTileZoom) return false;
  const patched = function redraw() {
    if (this._map) {
      this._removeAllTiles();
      const tileZoom = redrawTileZoom(this._map.getZoom(), this.options, (z) => this._clampZoom(z));
      if (tileZoom !== this._tileZoom) {
        this._tileZoom = tileZoom;
        this._updateLevels();
      }
      this._update();
    }
    return this;
  };
  patched.__sweepRoundsTileZoom = true;
  proto.redraw = patched;
  return true;
}
