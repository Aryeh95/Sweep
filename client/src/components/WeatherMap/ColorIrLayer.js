// Colour-enhanced GOES-East infrared, drawn client-side.
//
// Every tile is painted pixel by pixel from IEM's raw channel-13 image
// (brightness counts on the satellite's fixed grid — see
// ui/irEnhancement.js for why the pre-coloured tiles cannot be used):
// tile pixel → lat/lon → fixed-grid metres → nearest source pixel →
// count → colour. ~8 ms of arithmetic per 256 px tile, so tiles are
// rendered one per macrotask rather than all inside the pan that asked
// for them, and a new scan repaints the tiles already on screen in place
// (no blank flash from a full redraw).

import L from "leaflet";
import { createLayerComponent, updateGridLayer } from "@react-leaflet/core";
import { buildIrLut, geosLatTerms, geosProject } from "~/ui/irEnhancement";

const LUT = buildIrLut();
const DEG = Math.PI / 180;

/**
 * Paint one tile from the decoded scan.
 *
 * @param {HTMLCanvasElement} canvas tile canvas
 * @param {{x: Number, y: Number, z: Number}} coords tile coordinates (wrapped)
 * @param {Object|null} grid decoded scan: {width, height, data, x0, y0, dx, dy, lon0}
 */
function paintTile(canvas, coords, grid) {
  const size = canvas.width;
  const ctx = canvas.getContext("2d");
  if (!grid) {
    ctx.clearRect(0, 0, size, canvas.height);
    return;
  }
  const img = ctx.createImageData(size, canvas.height);
  const px = img.data;
  const world = size * 2 ** coords.z;
  const cosDl = new Float64Array(size);
  const sinDl = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    const lon = ((coords.x * size + i + 0.5) / world) * 360 - 180;
    const dl = (lon - grid.lon0) * DEG;
    cosDl[i] = Math.cos(dl);
    sinDl[i] = Math.sin(dl);
  }
  const { width, height, data, x0, y0, dx, dy } = grid;
  for (let j = 0; j < canvas.height; j += 1) {
    const yMerc = Math.PI * (1 - (2 * (coords.y * size + j + 0.5)) / world);
    const lt = geosLatTerms(Math.atan(Math.sinh(yMerc)) / DEG);
    let o = j * size * 4;
    for (let i = 0; i < size; i += 1, o += 4) {
      const p = geosProject(lt, cosDl[i], sinDl[i]);
      if (!p) continue;
      const col = Math.round((p[0] - x0) / dx);
      const row = Math.round((y0 - p[1]) / dy);
      if (col < 0 || row < 0 || col >= width || row >= height) continue;
      const c = data[row * width + col] * 4;
      px[o] = LUT[c];
      px[o + 1] = LUT[c + 1];
      px[o + 2] = LUT[c + 2];
      px[o + 3] = LUT[c + 3];
    }
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
      paintTile(canvas, coords, this.options.grid);
      done(null, canvas);
    }, 0);
    return canvas;
  },

  /**
   * Swap in a new scan and repaint the loaded tiles in place.
   *
   * @param {object|null} grid decoded scan, or null to clear
   */
  setGrid(grid) {
    this.options.grid = grid;
    for (const key of Object.keys(this._tiles || {})) {
      const t = this._tiles[key];
      // `_tiles` keeps the unwrapped coords; createTile was given wrapped ones.
      if (t && t.loaded && t.el) paintTile(t.el, this._wrapCoords(t.coords), grid);
    }
  },
});

/**
 * react-leaflet component: GridLayer options plus `grid` (the decoded
 * scan from useGoesIrImage, or null to draw nothing).
 */
const ColorIrLayer = createLayerComponent(
  function createColorIrLayer({ grid, ...options }, ctx) {
    const layer = new ColorIrGridLayer({ ...options, grid });
    return { instance: layer, context: { ...ctx, overlayContainer: layer } };
  },
  function updateColorIrLayer(layer, props, prevProps) {
    updateGridLayer(layer, props, prevProps);
    if (props.grid !== prevProps.grid) layer.setGrid(props.grid);
  },
);

export default ColorIrLayer;
