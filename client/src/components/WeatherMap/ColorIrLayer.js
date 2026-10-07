// GOES-East infrared, drawn client-side — both the plain (gray) and the
// colour-enhanced mode, live and looped.
//
// Every tile is painted pixel by pixel from brightness counts on the
// satellite's fixed grid (IEM's raw scan for the live frame, NOAA's CMIP
// files via /api/satellite/ir/frame for history — see ui/irEnhancement.js
// for why IEM's pre-coloured tiles cannot be used): tile pixel → lat/lon →
// fixed-grid metres → nearest source pixel → count → colour.
//
// The projection is the expensive part (~8 ms per 256 px tile) and it
// depends only on the tile and the grid GEOMETRY, which every scan shares.
// So each tile computes its pixel → source-index map once and keeps it;
// switching to another scan (an animation step) is a table lookup per
// pixel. Tiles are first painted one per macrotask rather than all inside
// the pan that asked for them.

import L from "leaflet";
import { createLayerComponent, updateGridLayer } from "@react-leaflet/core";
import { buildIrLut, geosLatTerms, geosProject, IR_GRAY_STOPS_C, IR_STOPS_C } from "~/ui/irEnhancement";

const LUTS = {
  color: buildIrLut(IR_STOPS_C),
  gray: buildIrLut(IR_GRAY_STOPS_C),
};
const DEG = Math.PI / 180;

/**
 * Geometry key: grids that share it share every tile's index map.
 *
 * @param {object} grid decoded scan
 * @returns {String} key
 */
function geometryKey(grid) {
  return `${grid.width}x${grid.height}@${grid.x0.toFixed(0)},${grid.y0.toFixed(0)}/${grid.dx.toFixed(3)},${grid.dy.toFixed(3)}/${grid.lon0}`;
}

/**
 * Source-pixel index for every pixel of a tile (−1 = outside the scan).
 *
 * @param {{x: Number, y: Number, z: Number}} coords tile coordinates (wrapped)
 * @param {Number} size tile edge in pixels
 * @param {object} grid decoded scan (geometry only is read)
 * @returns {Int32Array} size × size indices
 */
function buildIndexMap(coords, size, grid) {
  const map = new Int32Array(size * size).fill(-1);
  const world = size * 2 ** coords.z;
  const cosDl = new Float64Array(size);
  const sinDl = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    const lon = ((coords.x * size + i + 0.5) / world) * 360 - 180;
    const dl = (lon - grid.lon0) * DEG;
    cosDl[i] = Math.cos(dl);
    sinDl[i] = Math.sin(dl);
  }
  const { width, height, x0, y0, dx, dy } = grid;
  for (let j = 0; j < size; j += 1) {
    const yMerc = Math.PI * (1 - (2 * (coords.y * size + j + 0.5)) / world);
    const lt = geosLatTerms(Math.atan(Math.sinh(yMerc)) / DEG);
    for (let i = 0; i < size; i += 1) {
      const p = geosProject(lt, cosDl[i], sinDl[i]);
      if (!p) continue;
      const col = Math.round((p[0] - x0) / dx);
      const row = Math.round((y0 - p[1]) / dy);
      if (col < 0 || row < 0 || col >= width || row >= height) continue;
      map[j * size + i] = row * width + col;
    }
  }
  return map;
}

/**
 * Paint one tile from a decoded scan, building (or reusing) its index map.
 *
 * @param {HTMLCanvasElement} canvas tile canvas
 * @param {{x: Number, y: Number, z: Number}} coords tile coordinates (wrapped)
 * @param {object|null} grid decoded scan: {width, height, data, x0, y0, dx, dy, lon0}
 * @param {Uint8ClampedArray} lut count → RGBA
 */
function paintTile(canvas, coords, grid, lut) {
  const size = canvas.width;
  const ctx = canvas.getContext("2d");
  if (!grid) {
    ctx.clearRect(0, 0, size, size);
    return;
  }
  const key = geometryKey(grid);
  if (canvas._irGeometry !== key) {
    canvas._irIndex = buildIndexMap(coords, size, grid);
    canvas._irGeometry = key;
  }
  const map = canvas._irIndex;
  const { data } = grid;
  const img = ctx.createImageData(size, size);
  const px = img.data;
  for (let k = 0, o = 0; k < map.length; k += 1, o += 4) {
    const src = map[k];
    if (src < 0) continue;
    const c = data[src] * 4;
    px[o] = lut[c];
    px[o + 1] = lut[c + 1];
    px[o + 2] = lut[c + 2];
    px[o + 3] = lut[c + 3];
  }
  ctx.putImageData(img, 0, 0);
}

const ColorIrGridLayer = L.GridLayer.extend({
  createTile(coords, done) {
    const size = this.getTileSize();
    const canvas = document.createElement("canvas");
    canvas.width = size.x;
    canvas.height = size.y;
    setTimeout(() => {
      paintTile(canvas, coords, this.options.grid, LUTS[this.options.palette] || LUTS.color);
      done(null, canvas);
    }, 0);
    return canvas;
  },

  /**
   * Swap in a new scan and/or palette and repaint the loaded tiles in place.
   *
   * @param {object|null} grid decoded scan, or null to clear
   * @param {String} palette "color" or "gray"
   */
  setFrame(grid, palette) {
    this.options.grid = grid;
    this.options.palette = palette;
    const lut = LUTS[palette] || LUTS.color;
    for (const key of Object.keys(this._tiles || {})) {
      const t = this._tiles[key];
      // `_tiles` keeps the unwrapped coords; createTile was given wrapped ones.
      if (t && t.loaded && t.el) paintTile(t.el, this._wrapCoords(t.coords), grid, lut);
    }
  },
});

/**
 * react-leaflet component: GridLayer options plus `grid` (a decoded scan,
 * or null to draw nothing) and `palette` ("color" or "gray").
 */
const ColorIrLayer = createLayerComponent(
  function createColorIrLayer({ grid, palette, ...options }, ctx) {
    const layer = new ColorIrGridLayer({ ...options, grid, palette });
    return { instance: layer, context: { ...ctx, overlayContainer: layer } };
  },
  function updateColorIrLayer(layer, props, prevProps) {
    updateGridLayer(layer, props, prevProps);
    if (props.grid !== prevProps.grid || props.palette !== prevProps.palette) layer.setFrame(props.grid, props.palette);
  },
);

export default ColorIrLayer;
