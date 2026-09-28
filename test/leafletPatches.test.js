// GridLayer.redraw() at a fractional zoom — the basemap blanking on a
// dark ↔ light switch (kiosk report 2026-09-28).
//
// react-leaflet answers a `url` prop change with `TileLayer.setUrl()`,
// which redraws through `GridLayer.redraw()`. In Leaflet 1.9.4 that
// method copies the map's zoom into the tile zoom without rounding,
// while `_setView` (pan / zoom / add) rounds it. On the free-zoom map
// (`zoomSnap: 0`) the zoom is almost always fractional, so a theme flip
// created tile level 7.676… and requested
// `/api/tiles/streets-v12/6.676380220353304/29/38` — measured in
// Playwright with a 60-px wheel step before the flip. The proxy truncates
// that to a z6 tile and Leaflet draws it in a grid scaled by 2^0.676: a
// uniform patch of ocean where the map was.
//
// `redrawTileZoom` is the pure resolution the patch installs; the copy
// below is compared to the source by test/verbatimSync.test.js.

const { test } = require("node:test");
const assert = require("node:assert/strict");

// ---------- start of verbatim copy from client/src/components/WeatherMap/leafletPatches.js ----------
function redrawTileZoom(mapZoom, options, clampZoom) {
  const tileZoom = Math.round(mapZoom);
  if ((options.maxZoom !== undefined && tileZoom > options.maxZoom)
    || (options.minZoom !== undefined && tileZoom < options.minZoom)) {
    return undefined;
  }
  return clampZoom(tileZoom);
}
// ---------- end of verbatim copy ----------

// Leaflet's own `_clampZoom`, for the native-range half of the rule.
const clampWith = (options) => (zoom) => {
  if (options.minNativeZoom !== undefined && zoom < options.minNativeZoom) return options.minNativeZoom;
  if (options.maxNativeZoom !== undefined && options.maxNativeZoom < zoom) return options.maxNativeZoom;
  return zoom;
};

test("redrawTileZoom rounds the map zoom the way _setView does", () => {
  const opts = { maxZoom: 18 };
  const clamp = clampWith(opts);
  // The measured case: map at 7.676… must draw level 8, never 7.676.
  assert.equal(redrawTileZoom(7.676380220353304, opts, clamp), 8);
  assert.equal(redrawTileZoom(7.4, opts, clamp), 7);
  assert.equal(redrawTileZoom(10, opts, clamp), 10);
  assert.ok(Number.isInteger(redrawTileZoom(10.26, opts, clamp)));
});

test("redrawTileZoom refuses levels outside min/max and clamps to the native range", () => {
  const clamp = clampWith({ maxNativeZoom: 12 });
  assert.equal(redrawTileZoom(18.4, { maxZoom: 18 }, clamp), 12, "clamped to maxNativeZoom");
  assert.equal(redrawTileZoom(18.6, { maxZoom: 18 }, clamp), undefined, "19 is past maxZoom: draw nothing");
  assert.equal(redrawTileZoom(2.4, { minZoom: 3 }, clamp), undefined);
  assert.equal(redrawTileZoom(2.6, { minZoom: 3 }, clamp), 3);
});

test("the installed Leaflet 1.9.4 still carries the unrounded redraw the patch exists for", () => {
  // If a Leaflet upgrade fixes redraw() upstream, this fails and the patch
  // (and this test) can go.
  const src = require("node:fs").readFileSync(require.resolve("leaflet/dist/leaflet-src.js", { paths: [`${__dirname}/../client`] }), "utf8");
  const m = src.match(/redraw: function \(\) \{\s*if \(this\._map\) \{\s*this\._removeAllTiles\(\);\s*var tileZoom = ([^;]+);/);
  assert.ok(m, "GridLayer.redraw not found in the expected shape");
  assert.equal(m[1].trim(), "this._clampZoom(this._map.getZoom())", "upstream redraw changed — re-check whether the patch is still needed");
});
