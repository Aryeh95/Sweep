// Point readout: what the radar and the satellite measure under the
// pointer — dBZ (or velocity / CC / rainfall in those modes) and the cloud-
// top temperature, together when both layers are on.
//
// Two input models, one readout:
//
//   MOUSE — hover (pointer events of type "mouse" only). The readout follows the cursor (down-right of it,
//   flipped at the container edges) and hides when the cursor leaves the
//   map or a button is pressed (it returns on the next move).
//
//   TOUCH — there is no hover, so the probe is a PRESS-AND-HOLD: a finger
//   held still for HOLD_MS drops a crosshair with the readout ABOVE the
//   finger (where the finger cannot cover it). While still held, sliding
//   moves the probe and the map does not pan. Lifting leaves the probe
//   PINNED at its last point — it rides along with pans and zooms and its
//   values follow the loop — until a short tap anywhere (on the map or
//   off it) puts it away. A mouse can press-and-hold too, which is what
//   a touch screen reported as a mouse gets.
//
// The values come from `probe(lat, lon)` (WeatherMap), which reads the
// decoded data behind each layer actually on screen; this component only
// tracks the point and formats the answer in the user's units.

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useMap, useMapEvents } from "react-leaflet";
import { useTranslation } from "react-i18next";
import { UiPrefsContext } from "~/AppContext";
import { colorForIrCelsius, IR_GRAY_STOPS_C, IR_STOPS_C } from "~/ui/irEnhancement";
import { colorForCorrelation, colorForDbz, colorForVelocity } from "./radialRender";
import { colorForDepthIn } from "../../../../server/accumulation";
import styles from "./styles.css";

// Long-press: how long a finger must stay, and how far it may wander, to
// become a probe rather than a pan or a tap.
const HOLD_MS = 450;
const HOLD_SLOP_PX = 10;
// A press shorter than this that wandered less than TAP_SLOP_PX is a TAP,
// and a tap dismisses a pinned readout. Looser than the hold slop: a quick
// finger tap on a phone routinely drifts past 10 px.
const TAP_MS = 350;
const TAP_SLOP_PX = 24;
// After a probe gesture the browser may still deliver a click; this long a
// window swallows it (the map click handler checks `guardRef`).
const CLICK_GUARD_MS = 700;
// Readout offsets: beside the cursor, above the finger.
const MOUSE_OFFSET = 16;
const TOUCH_LIFT = 72;

const fmtSigned = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));

/**
 * One readout line's text and swatch colour.
 *
 * @param {object} item probe item {kind, value, source, palette}
 * @param {object} ctx formatting context
 * @param {(key: String, vars?: object) => String} ctx.t i18n translate
 * @param {String} ctx.speedUnit "mph" | "kmh" | "ms" | "kt"
 * @param {String} ctx.lengthUnit "in" | "mm" (also picks °F / °C)
 * @param {String} ctx.radarPalette reflectivity palette id
 * @returns {{text: String, color: String|null}} formatted line
 */
export function formatProbeItem(item, { t, speedUnit, lengthUnit, radarPalette }) {
  const rgb = (c) => (c && c[3] !== 0 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : null);
  const src = item.source ? `${item.source} · ` : "";
  switch (item.kind) {
    case "dbz":
      return { text: `${src}${Math.round(item.value)} dBZ`, color: rgb(colorForDbz(item.value, radarPalette)) };
    case "velocity": {
      const kmh = Math.abs(item.value) * 3.6;
      let speed;
      if (speedUnit === "mph") speed = `${Math.round(kmh / 1.609344)} mph`;
      else if (speedUnit === "ms" || speedUnit === "m/s") speed = `${Math.round(kmh / 3.6)} m/s`;
      else if (speedUnit === "kt") speed = `${Math.round(kmh / 1.852)} kt`;
      else speed = `${Math.round(kmh)} km/h`;
      // Negative radial velocity is TOWARD the radar.
      const key = item.value < 0 ? "probe.toward" : "probe.away";
      return { text: `${src}${t(key, { speed })}`, color: rgb(colorForVelocity(item.value, radarPalette)) };
    }
    case "cc":
      return { text: `${src}CC ${item.value.toFixed(2)}`, color: rgb(colorForCorrelation(item.value)) };
    case "accum": {
      const amount = lengthUnit === "mm" ? `${Math.round(item.value * 25.4)} mm` : `${item.value.toFixed(2)} in`;
      return { text: `${src}${t("probe.rain", { amount })}`, color: rgb(colorForDepthIn(item.value)) };
    }
    case "cloudTop": {
      const c = item.value - 273.15;
      const temp = lengthUnit === "in" ? `${fmtSigned(Math.round(c * 1.8 + 32))} °F` : `${fmtSigned(Math.round(c))} °C`;
      const stops = item.palette === "gray" ? IR_GRAY_STOPS_C : IR_STOPS_C;
      // Above freezing the infrared is as likely to be the ground (or low
      // cloud) as a cloud top — over clear land it read "Cloud top 88 °F".
      return { text: t(c <= 0 ? "probe.cloudTop" : "probe.infrared", { temp }), color: rgb(colorForIrCelsius(c, stops)) };
    }
    default:
      return { text: String(item.value), color: null };
  }
}

/**
 * The point readout (see the header for the mouse and touch behaviour).
 *
 * @param {object} props
 * @param {(lat: Number, lon: Number) => Array<object>} props.probe the values under a point: [{kind, value, source?, palette?}]
 * @param {object} props.guardRef ref whose `.current` holds a time (ms) before which map clicks are swallowed
 * @param {String} props.radarPalette reflectivity palette id, for the swatches
 * @returns {JSX.Element|null} the readout, portalled into the map container
 */
const MapProbe = ({ probe, guardRef, radarPalette }) => {
  const map = useMap();
  const { t } = useTranslation();
  const { speedUnit, lengthUnit } = useContext(UiPrefsContext);
  // {latlng, mode: "mouse" | "touch", pinned: Boolean}
  const [point, setPoint] = useState(null);
  // Bumped on map move/zoom so a pinned probe is re-positioned.
  const [, setViewTick] = useState(0);
  const holdRef = useRef(null); // {timer, x, y, id, active}
  const frameRef = useRef(0);

  const guard = useCallback(() => { guardRef.current = Date.now() + CLICK_GUARD_MS; }, [guardRef]);

  // A pinned probe follows pans and zooms. And Leaflet's own `click` —
  // the event that moved the location pin on every device until
  // 2026-10-09, so known to arrive on the phone — dismisses a readout
  // that is not being held, as a backstop to the pointer handling below
  // (2.13.12 still left the readout up after a tap in the app). The guard
  // keeps the click that ends a hold from dismissing what it just pinned.
  useMapEvents({
    move: () => setViewTick((n) => n + 1),
    zoom: () => setViewTick((n) => n + 1),
    click: () => {
      if (Date.now() < guardRef.current) return;
      if (holdRef.current && holdRef.current.active) return;
      setPoint((p) => (p && p.mode === "touch" ? null : p));
    },
  });

  // Pointer events on the map container, for both inputs. Hover listens
  // to `pointerType === "mouse"` only: after a TAP the browser also fires
  // compatibility mouse events (mousedown, mousemove, click), and the
  // first version — on Leaflet's `mousemove` — popped a hover readout up
  // under every tap. Compatibility events are never pointer events.
  //
  // Press-and-hold works for EVERY pointer type, mouse included: some
  // touch screens reach the browser as a mouse (Firefox on X11 without
  // XInput2 — the kiosk), and there a tap is a mouse move + press. So a
  // mouse press hides the hover readout and hover stays off until the
  // pointer moves with no button down; a tap on such a screen then leaves
  // nothing behind, and holding still shows the readout like a finger.
  useEffect(() => {
    const el = map.getContainer();
    // Hold the map still while a probe slides. NOT `map.dragging.disable()`:
    // that removes Leaflet's `leaflet-touch-drag` class, which flips the
    // container's CSS `touch-action` from `none` to `pan-x pan-y`, and the
    // browser reads touch-action when each finger LANDS — so a pinch whose
    // second finger arrived during a hold was handed to the browser, not
    // Leaflet (pinch broke on the Firefox kiosk while drag still worked).
    // The Draggable underneath stops the pan without touching the class.
    // (`_draggable` exists once dragging has been enabled; with no Draggable
    // the map cannot pan anyway, so there is nothing to freeze.)
    const freezePan = () => map.dragging._draggable?.disable();
    const thawPan = () => {
      if (map.dragging.enabled()) map.dragging._draggable?.enable();
    };
    let hoverOff = false;
    let downAt = null; // {x, y} of the last mouse press, for hoverOff
    const latlngAt = (ev) => {
      const r = el.getBoundingClientRect();
      return map.containerPointToLatLng([ev.clientX - r.left, ev.clientY - r.top]);
    };
    const onHover = (ev) => {
      if (ev.buttons) return;
      if (hoverOff) {
        if (downAt && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) < 3) return;
        hoverOff = false;
      }
      const latlng = latlngAt(ev);
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => setPoint((p) => (p && p.pinned ? p : { latlng, mode: "mouse", pinned: false })));
    };
    const onLeave = (ev) => {
      if (ev.pointerType !== "mouse") return;
      cancelAnimationFrame(frameRef.current);
      setPoint((p) => (p && !p.pinned ? null : p));
    };
    const onDown = (ev) => {
      if (!ev.isPrimary) {
        // A second finger is a pinch, never a probe: cancel a pending hold,
        // end an active one (dropping its unpinned readout), and let the
        // remaining finger's lift be neither a pin nor a dismissing tap.
        const hold = holdRef.current;
        if (hold) {
          clearTimeout(hold.timer);
          if (hold.active) {
            thawPan();
            cancelAnimationFrame(frameRef.current);
            setPoint((p) => (p && !p.pinned ? null : p));
          }
          holdRef.current = null;
        }
        return;
      }
      if (ev.pointerType === "mouse") {
        if (ev.button !== 0) return;
        hoverOff = true;
        downAt = { x: ev.clientX, y: ev.clientY };
        cancelAnimationFrame(frameRef.current);
        setPoint((p) => (p && !p.pinned ? null : p));
      }
      // A hold whose lift never reached us (the platform swallowed it)
      // must not stay "held": finish it as if lifted, so this press can
      // dismiss it and the map pans again.
      const stale = holdRef.current;
      if (stale) {
        clearTimeout(stale.timer);
        if (stale.active) {
          thawPan();
          setPoint((p) => (p ? { ...p, pinned: true } : p));
        }
      }
      // A shown probe: this press is either a pan (move) or a dismissing
      // tap (decided on up).
      const hold = { x: ev.clientX, y: ev.clientY, t: Date.now(), id: ev.pointerId, active: false, moved: false, far: false, timer: null };
      hold.timer = setTimeout(() => {
        hold.active = true;
        freezePan();
        setPoint({ latlng: latlngAt(ev), mode: "touch", pinned: false });
      }, HOLD_MS);
      holdRef.current = hold;
    };
    const onMove = (ev) => {
      if (ev.pointerType === "mouse") onHover(ev);
      const hold = holdRef.current;
      if (!hold || ev.pointerId !== hold.id) return;
      if (hold.active) {
        const latlng = latlngAt(ev);
        cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => setPoint({ latlng, mode: "touch", pinned: false }));
        return;
      }
      const d = Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y);
      if (d > HOLD_SLOP_PX) {
        clearTimeout(hold.timer);
        hold.moved = true;
      }
      if (d > TAP_SLOP_PX) hold.far = true;
    };
    const onUp = (ev) => {
      const hold = holdRef.current;
      if (!hold || ev.pointerId !== hold.id) return;
      clearTimeout(hold.timer);
      holdRef.current = null;
      if (hold.active) {
        thawPan();
        guard();
        setPoint((p) => (p ? { ...p, pinned: true } : p));
        return;
      }
      // A tap while a probe is pinned dismisses it, and only that (the
      // guard keeps the same tap from opening an alert popup). A pan keeps
      // it: the readout rides along with the map.
      const tap = ev.type === "pointerup" && !hold.far && (!hold.moved || Date.now() - hold.t < TAP_MS);
      if (tap) {
        setPoint((p) => {
          if (p && (p.pinned || p.mode === "touch")) {
            guard();
            return null;
          }
          return p;
        });
      }
    };
    // A press anywhere OUTSIDE the map (header, dock, legend) also puts a
    // pinned readout away — except on the timeline (`data-keeps-probe`),
    // which floats over the map but is not in its container: scrubbing or
    // playing the loop under a pinned point is how its values are read
    // through time.
    const onDocDown = (ev) => {
      if (el.contains(ev.target)) return;
      if (ev.target instanceof Element && ev.target.closest("[data-keeps-probe]")) return;
      setPoint((p) => (p && (p.pinned || p.mode === "touch") ? null : p));
    };
    // Long-press must not open a context menu (Android WebView, desktop
    // touch screens).
    // Suppressed from the first moment a hold is POSSIBLE, not only once it
    // is active: Android's long-press timeout is 400 ms on current
    // releases, shorter than HOLD_MS, and an unhandled long press there
    // can end the touch sequence (pointercancel) or start a text
    // selection that eats the next tap.
    const onContext = (ev) => {
      if (holdRef.current && ev.pointerType !== "mouse") ev.preventDefault();
    };
    // Presses start on the map container; moves, lifts and cancels are
    // followed on the DOCUMENT, so a lift that lands (or is retargeted)
    // outside the container still ends the hold.
    const onDocMove = (ev) => {
      if (ev.pointerType === "mouse" && !el.contains(ev.target)) return;
      onMove(ev);
    };
    el.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onDocMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    el.addEventListener("contextmenu", onContext, true);
    el.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerdown", onDocDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onDocMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      el.removeEventListener("contextmenu", onContext, true);
      if (holdRef.current) clearTimeout(holdRef.current.timer);
      cancelAnimationFrame(frameRef.current);
      thawPan();
    };
  }, [map, guard]);

  if (!point) return null;
  const items = probe(point.latlng.lat, point.latlng.lng) || [];
  const touch = point.mode === "touch";
  // Mouse hover over nothing measurable shows nothing; a touch probe
  // always answers, so the gesture never looks ignored.
  if (!items.length && !touch) return null;

  const size = map.getSize();
  const at = map.latLngToContainerPoint(point.latlng);
  const lines = items.map((it) => formatProbeItem(it, { t, speedUnit, lengthUnit, radarPalette }));
  const boxStyle = {};
  if (touch) {
    boxStyle.left = Math.min(Math.max(at.x, 90), size.x - 90);
    boxStyle.top = Math.max(at.y - TOUCH_LIFT, 8);
    boxStyle.transform = "translate(-50%, -100%)";
  } else {
    const flipX = at.x > size.x - 200;
    const flipY = at.y > size.y - 90;
    boxStyle.left = at.x + (flipX ? -MOUSE_OFFSET : MOUSE_OFFSET);
    boxStyle.top = at.y + (flipY ? -MOUSE_OFFSET : MOUSE_OFFSET);
    boxStyle.transform = `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`;
  }

  return createPortal(
    <>
      {touch ? (
        <div className={styles.probeCrosshair} style={{ left: at.x, top: at.y }} aria-hidden="true" />
      ) : null}
      <div className={`${styles.probeBox} ${touch ? styles.probeBoxTouch : ""}`} style={boxStyle} role="status" aria-live="polite">
        {lines.length ? lines.map((l) => (
          <div key={l.text} className={styles.probeLine}>
            {l.color ? <span className={styles.probeSwatch} style={{ background: l.color }} aria-hidden="true" /> : null}
            <span>{l.text}</span>
          </div>
        )) : <div className={styles.probeLine}>{t("probe.nothing")}</div>}
      </div>
    </>,
    map.getContainer(),
  );
};

MapProbe.propTypes = {
  probe: PropTypes.func.isRequired,
  guardRef: PropTypes.shape({ current: PropTypes.number }).isRequired,
  radarPalette: PropTypes.string,
};

export default MapProbe;
