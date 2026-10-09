// Point readout: what the radar and the satellite measure under the
// pointer — dBZ (or velocity / CC / rainfall in those modes) and the cloud-
// top temperature, together when both layers are on.
//
// Two input models, one readout:
//
//   MOUSE — hover (pointer events of type "mouse" only). The readout follows the cursor (down-right of it,
//   flipped at the container edges) and hides when the cursor leaves the
//   map. Nothing to click; clicks keep moving the location pin as before.
//
//   TOUCH — there is no hover, and a tap already moves the pin, so the probe
//   is a PRESS-AND-HOLD: a finger held still for HOLD_MS drops a crosshair
//   with the readout ABOVE the finger (where the finger cannot cover it).
//   While still held, sliding moves the probe and the map does not pan.
//   Lifting leaves the probe PINNED at its last point — it rides along
//   with pans and zooms and its values follow the loop — until the next
//   tap, which only dismisses it (that tap does not move the pin).
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

  // A pinned probe follows pans and zooms.
  useMapEvents({
    move: () => setViewTick((n) => n + 1),
    zoom: () => setViewTick((n) => n + 1),
  });

  // Pointer events on the map container, for both inputs. Hover listens
  // to `pointerType === "mouse"` only: after a TAP the browser also fires
  // compatibility mouse events (mousedown, mousemove, click), and the
  // first version — on Leaflet's `mousemove` — popped a hover readout up
  // under every tap. Compatibility events are never pointer events.
  useEffect(() => {
    const el = map.getContainer();
    const latlngAt = (ev) => {
      const r = el.getBoundingClientRect();
      return map.containerPointToLatLng([ev.clientX - r.left, ev.clientY - r.top]);
    };
    const onHover = (ev) => {
      if (ev.pointerType !== "mouse") return;
      const latlng = latlngAt(ev);
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => setPoint((p) => (p && p.pinned ? p : { latlng, mode: "mouse", pinned: false })));
    };
    const onLeave = (ev) => {
      if (ev.pointerType !== "mouse") return;
      cancelAnimationFrame(frameRef.current);
      setPoint((p) => (p && p.mode === "mouse" ? null : p));
    };
    const onDown = (ev) => {
      if (ev.pointerType !== "touch" || !ev.isPrimary) return;
      // A pinned probe: this touch is either a pan (move) or a dismissing
      // tap (decided on up).
      const hold = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, active: false, moved: false, timer: null };
      hold.timer = setTimeout(() => {
        hold.active = true;
        map.dragging.disable();
        setPoint({ latlng: latlngAt(ev), mode: "touch", pinned: false });
      }, HOLD_MS);
      holdRef.current = hold;
    };
    const onMove = (ev) => {
      if (ev.pointerType === "mouse") {
        onHover(ev);
        return;
      }
      const hold = holdRef.current;
      if (!hold || ev.pointerId !== hold.id) return;
      if (hold.active) {
        const latlng = latlngAt(ev);
        cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => setPoint({ latlng, mode: "touch", pinned: false }));
        return;
      }
      if (Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > HOLD_SLOP_PX) {
        clearTimeout(hold.timer);
        hold.moved = true;
      }
    };
    const onUp = (ev) => {
      const hold = holdRef.current;
      if (!hold || ev.pointerId !== hold.id) return;
      clearTimeout(hold.timer);
      holdRef.current = null;
      if (hold.active) {
        map.dragging.enable();
        guard();
        setPoint((p) => (p ? { ...p, pinned: true } : p));
        return;
      }
      // A plain tap while a probe is pinned dismisses it, and only that.
      if (!hold.moved && ev.type === "pointerup") {
        setPoint((p) => {
          if (p && p.pinned) {
            guard();
            return null;
          }
          return p;
        });
      }
    };
    // Long-press must not open a context menu (Android WebView, desktop
    // touch screens).
    const onContext = (ev) => {
      if (holdRef.current && holdRef.current.active) ev.preventDefault();
    };
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("pointercancel", onUp, true);
    el.addEventListener("contextmenu", onContext, true);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointermove", onMove, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("pointercancel", onUp, true);
      el.removeEventListener("contextmenu", onContext, true);
      if (holdRef.current) clearTimeout(holdRef.current.timer);
      cancelAnimationFrame(frameRef.current);
      map.dragging.enable();
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
