// MapProbe freezes the map during a press-and-hold through Leaflet's
// INTERNAL `map.dragging._draggable`, not `map.dragging.disable()`: the
// public method removes `leaflet-touch-drag`, which flips the container's
// CSS touch-action from `none` to `pan-x pan-y`, and a pinch whose second
// finger landed during a hold went to the browser instead of Leaflet
// (pinch broke on the Firefox kiosk, 2026-10-09). These tests fail if a
// Leaflet upgrade changes either half of that, so the probe can be revisited.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const dir = require("node:path").dirname(require.resolve("leaflet/dist/leaflet-src.js", { paths: [`${__dirname}/../client`] }));
const src = fs.readFileSync(`${dir}/leaflet-src.js`, "utf8");
const css = fs.readFileSync(`${dir}/leaflet.css`, "utf8");

test("Map.Drag keeps its Draggable on `_draggable`", () => {
  assert.match(src, /this\._draggable = new Draggable\(map\._mapPane, map\._container\)/);
  assert.match(src, /this\._draggable\.disable\(\);/);
});

test("disabling the Drag handler still drops the class that holds touch-action: none", () => {
  assert.match(src, /removeClass\(this\._map\._container, 'leaflet-touch-drag'\);/);
  assert.match(css, /\.leaflet-container\.leaflet-touch-drag\.leaflet-touch-zoom \{[^}]*touch-action: none;/);
  assert.match(css, /\.leaflet-container\.leaflet-touch-zoom \{[^}]*touch-action: pan-x pan-y;/);
});

test("the probe freezes through the Draggable, never the Drag handler", () => {
  const probe = fs.readFileSync(`${__dirname}/../client/src/components/WeatherMap/MapProbe.js`, "utf8");
  assert.match(probe, /map\.dragging\._draggable\?\.disable\(\)/);
  assert.doesNotMatch(probe, /map\.dragging\.disable\(\)\s*;/);
});
