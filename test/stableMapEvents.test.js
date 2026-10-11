// react-leaflet's `useMapEvents` re-subscribes on every render when given an
// inline handlers object, and an event fired by a sibling's effect during
// that commit is lost (2026-10-11: locate's pan to a new city never reached
// the view tracker, so the radar stayed on the old site). The client uses
// `WeatherMap/useStableMapEvents` instead; this keeps it that way.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(p);
    return /\.jsx?$/.test(e.name) ? [p] : [];
  });
}

test("no client component subscribes through react-leaflet's useMapEvents", () => {
  const src = path.join(__dirname, "../client/src");
  const offenders = jsFiles(src).filter((f) => {
    const code = fs.readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    return /\buseMapEvents\s*\(/.test(code) || /\buseMapEvents\b[^]*from "react-leaflet"/.test(code);
  });
  assert.deepEqual(offenders.map((f) => path.relative(src, f)), []);
});
