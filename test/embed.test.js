// Embed mode (client/src/ui/embed.js): URL options → in-memory preferences.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const load = () => import("../client/src/ui/embed.js");

test("embed is entered by the /embed path or ?embed=1, nothing else", async () => {
  const { parseEmbed } = await load();
  assert.equal(parseEmbed({ pathname: "/embed", search: "" }).on, true);
  assert.equal(parseEmbed({ pathname: "/embed/", search: "" }).on, true);
  assert.equal(parseEmbed({ pathname: "/", search: "?embed=1" }).on, true);
  assert.equal(parseEmbed({ pathname: "/", search: "" }).on, false);
  assert.equal(parseEmbed({ pathname: "/", search: "?embed=0" }).on, false);
  assert.equal(parseEmbed(null).on, false);
});

test("options: defaults, bounds and fallbacks", async () => {
  const { parseEmbed } = await load();
  const d = parseEmbed({ pathname: "/embed", search: "" });
  assert.deepEqual(d, {
    on: true, zoom: null, theme: "auto", play: false, lightning: false, tracks: false,
    alerts: false, satellite: "off", chip: true, pin: true,
  });
  const o = parseEmbed({ pathname: "/embed", search: "?zoom=9.5&theme=DARK&play=1&lightning=true&tracks=yes&alerts=on&satellite=irc&chip=0&pin=false" });
  assert.equal(o.zoom, 9.5);
  assert.equal(o.theme, "dark");
  assert.ok(o.play && o.lightning && o.tracks && o.alerts);
  assert.equal(o.satellite, "irc");
  assert.equal(o.chip, false);
  assert.equal(o.pin, false);
  const bad = parseEmbed({ pathname: "/embed", search: "?zoom=40&theme=neon&satellite=uv" });
  assert.equal(bad.zoom, null);
  assert.equal(bad.theme, "auto");
  assert.equal(bad.satellite, "off");
});

test("preferences: the kiosk's red night palette and nowcast card are off; zoom/theme only when asked", async () => {
  const { parseEmbed, embedPrefs } = await load();
  const auto = embedPrefs(parseEmbed({ pathname: "/embed", search: "" }));
  assert.equal(auto.sleepNightMode, "false");
  assert.equal(auto.showNowcast, "false");
  assert.equal(auto.darkModeAuto, "true");
  assert.ok(!("darkMode" in auto) && !("defaultMapZoom" in auto));
  assert.equal(auto.radarTimelineVisible, "false", "no loop unless play=1");
  const set = embedPrefs(parseEmbed({ pathname: "/embed", search: "?zoom=7&theme=light&play=1" }));
  assert.equal(set.darkMode, "false");
  assert.equal(set.darkModeAuto, "false");
  assert.equal(set.defaultMapZoom, "7");
  assert.equal(set.radarTimelineVisible, "true");
});

test("every embed preference key is one the client actually reads", async () => {
  const { parseEmbed, embedPrefs } = await load();
  const src = path.join(__dirname, "../client/src");
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.js$/.test(e.name) && !p.endsWith(path.join("ui", "embed.js"))) files.push(fs.readFileSync(p, "utf8"));
    }
  };
  walk(src);
  const all = files.join("\n");
  const keys = Object.keys(embedPrefs(parseEmbed({ pathname: "/embed", search: "?zoom=8&theme=dark" })));
  for (const k of keys) assert.ok(all.includes(`"${k}"`), `client never reads localStorage "${k}" — renamed?`);
});

test("memoryStorage behaves like Storage and never touches the real one", async () => {
  const { memoryStorage } = await load();
  const s = memoryStorage({ a: "1" });
  assert.equal(s.getItem("a"), "1");
  assert.equal(s.getItem("missing"), null);
  s.setItem("b", 2);
  assert.equal(s.getItem("b"), "2");
  assert.equal(s.length, 2);
  s.removeItem("a");
  assert.equal(s.key(0), "b");
  s.clear();
  assert.equal(s.length, 0);
});
