// Map-based home-location picker, opened from Settings.
//
// Since 2026-10-09 tapping the radar map no longer moves the location pin
// (on the touch kiosk it happened by accident, and a press-and-hold now
// reads radar / satellite values). This is where the location is chosen
// instead: a map that pans under a FIXED centre pin — easier to aim on a
// touch screen than dragging a small marker — with the coordinates
// spelled out. A tap re-centres on the tapped spot. "Set location" moves
// the pin and saves the point as the default (AppContext.setHomeLocation).

import React, { useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import { AppContext } from "~/AppContext";
import { mapTileUrl, mapAttribution, mapMaxNativeZoom, isUsableMapboxToken } from "~/standalone/upstream";
import styles from "./styles.css";

const MAPBOX_ATTRIBUTION = '© <a href="https://www.mapbox.com/feedback/">Mapbox</a>';
const PICKER_ZOOM = 9;

/**
 * Reports the map centre on every move, and re-centres on a tap.
 *
 * @param {object} props
 * @param {(c: {lat: Number, lng: Number}) => void} props.onCenter called with the new centre
 * @returns {null} renders nothing
 */
const CenterTracker = ({ onCenter }) => {
  const map = useMapEvents({
    move: () => onCenter(map.getCenter()),
    click: (e) => map.panTo(e.latlng),
  });
  return null;
};

CenterTracker.propTypes = { onCenter: PropTypes.func.isRequired };

/**
 * Format one coordinate with its hemisphere.
 *
 * @param {Number} v degrees
 * @param {String} pos suffix when ≥ 0
 * @param {String} neg suffix when < 0
 * @returns {String} e.g. "39.3743° N"
 */
const coord = (v, pos, neg) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

/**
 * The picker dialog.
 *
 * @param {object} props
 * @param {() => void} props.onClose close without changing anything
 * @param {(key: String) => String} props.label localised strings, keyed
 * @returns {JSX.Element} the dialog
 */
const LocationPicker = ({ onClose, label }) => {
  const ctx = useContext(AppContext);
  const { mapGeo, browserGeo, setHomeLocation, darkMode, lightModeStyle, darkModeStyle, appMapboxToken } = ctx;
  const start = mapGeo || browserGeo || { latitude: 39.5, longitude: -98.35 };
  const [center, setCenter] = useState({ lat: start.latitude, lng: start.longitude });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSet = useCallback(() => {
    if (saving) return;
    setSaving(true);
    Promise.resolve(setHomeLocation(center.lat, center.lng)).finally(() => onClose());
  }, [saving, setHomeLocation, center, onClose]);

  const style = darkMode ? darkModeStyle : lightModeStyle;
  const esri = __STANDALONE__ && !isUsableMapboxToken(appMapboxToken);

  return (
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-label={label("title")}>
      <div className={styles.card}>
        <div className={styles.head}>
          <div className={styles.title}>{label("title")}</div>
          <div className={styles.hint}>{label("hint")}</div>
        </div>
        <div className={styles.mapWrap}>
          <MapContainer
            center={[start.latitude, start.longitude]}
            zoom={PICKER_ZOOM}
            zoomSnap={0}
            className={styles.map}
            attributionControl
          >
            <TileLayer
              attribution={__STANDALONE__ ? mapAttribution(appMapboxToken) : MAPBOX_ATTRIBUTION}
              url={__STANDALONE__
                ? mapTileUrl(darkMode, { token: appMapboxToken, style })
                : `/api/tiles/${style}/{z}/{x}/{y}`}
              tileSize={esri ? 256 : 512}
              zoomOffset={esri ? 0 : -1}
              maxZoom={18}
              maxNativeZoom={__STANDALONE__ ? mapMaxNativeZoom(appMapboxToken) : undefined}
            />
            <CenterTracker onCenter={setCenter} />
          </MapContainer>
          {/* The pin is drawn over the map's centre, not on it: the map
            * moves underneath, so the point chosen is always the centre. */}
          <div className={styles.pin} aria-hidden="true" />
        </div>
        <div className={styles.foot}>
          <div className={styles.coords}>
            {coord(center.lat, "N", "S")} · {coord(((center.lng + 540) % 360) - 180, "E", "W")}
          </div>
          <div className={styles.buttons}>
            <button type="button" className={styles.cancel} onClick={onClose}>{label("cancel")}</button>
            <button type="button" className={styles.set} onClick={onSet} disabled={saving}>{label("set")}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

LocationPicker.propTypes = {
  onClose: PropTypes.func.isRequired,
  label: PropTypes.func.isRequired,
};

export default LocationPicker;
