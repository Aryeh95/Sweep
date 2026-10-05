// RadarScope-style radar site picker: a labelled chip on every WSR-88D,
// tap to pin the single-site layer to that radar, tap the pinned one to
// go back to automatic. The active site (whatever the frames poller is
// serving, pinned or not) is highlighted; a pinned one also carries a
// pin mark so "auto happened to pick this" and "I chose this" read
// differently.
//
// Chips are Leaflet divIcon markers: 159 of them is nothing, and using
// real markers (rather than a canvas) keeps them tappable on the kiosk
// touch screen. `bubblingMouseEvents: false` so the tap never reaches
// the map click handler that moves the location pin.
//
// Offline radars are drawn red, as RadarScope does, from the per-radar
// state /api/radar/status reports (no Level II for 15 min, or the radar
// reporting itself inoperable). An offline radar can still be tapped and
// pinned — RadarScope allows it too, and the frame-age chip then says
// plainly that nothing new is arriving. The chip's title carries how long
// it has been silent.

import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import L from "leaflet";
import { Marker } from "react-leaflet";

import { NEXRAD_SITES, iemSiteId } from "./radarSites";
import styles from "./styles.css";

/**
 * How long a radar has been silent, in the coarsest unit that still reads
 * right: "40 min", "10 h", "6 d".
 *
 * @param {Number|null} ageMin minutes since the last Level II data
 * @returns {String|null}
 */
export function silentFor(ageMin) {
  if (!Number.isFinite(ageMin)) return null;
  if (ageMin < 120) return `${Math.round(ageMin)} min`;
  if (ageMin < 48 * 60) return `${Math.round(ageMin / 60)} h`;
  return `${Math.round(ageMin / 1440)} d`;
}

/**
 * @param {Object} props
 * @param {String|null} props.activeSite 3-letter id the site layer is currently serving
 * @param {String} props.pinnedSite 3-letter manual override, "" for automatic
 * @param {Object<String, {state: String, reason: String|null, ageMin: Number|null}>} [props.status] per-radar state from /api/radar/status, keyed by 3-letter id
 * @param {Boolean} props.interactive false renders the chips but ignores taps (remote clients)
 * @param {Function} props.onPick called with a 3-letter id, or "" to return to automatic
 * @returns {JSX.Element}
 */
const RadarSitePicker = ({ activeSite = null, pinnedSite = "", status = {}, interactive = true, onPick }) => {
  const { t } = useTranslation();
  // The chip's look is the only per-site difference, so the icon factory
  // takes the class list; Leaflet clones the html per marker anyway.
  const icon = useMemo(() => (id, cls) => L.divIcon({
    className: styles.radarSiteIcon,
    html: `<span class="${styles.radarSiteChip} ${cls}">${id}</span>`,
    iconSize: null,
    iconAnchor: [0, 0],
  }), []);

  return (
    <>
      {NEXRAD_SITES.map((s) => {
        const id3 = iemSiteId(s.id);
        const isPinned = pinnedSite && pinnedSite === id3;
        const isActive = isPinned || (activeSite && activeSite === id3);
        const st = status[id3];
        const isOffline = Boolean(st && st.state === "offline");
        const cls = [
          isActive ? styles.radarSiteChipActive : "",
          isPinned ? styles.radarSiteChipPinned : "",
          isOffline ? styles.radarSiteChipOffline : "",
        ].filter(Boolean).join(" ");
        const silent = isOffline ? silentFor(st.ageMin) : null;
        let title = `${s.id} ${s.name}`;
        if (isOffline) {
          title = silent && st.reason === "no-data"
            ? t("radar.siteOfflineFor", { site: title, age: silent })
            : t("radar.siteOffline", { site: title });
        }
        return (
          <Marker
            // The key carries the look: react-leaflet updates a Marker's
            // icon in place, but re-keying keeps the title in step too.
            key={`${s.id}-${cls}`}
            position={[s.lat, s.lon]}
            icon={icon(s.id, cls)}
            title={title}
            alt={title}
            interactive={interactive}
            bubblingMouseEvents={false}
            keyboard={false}
            eventHandlers={interactive ? {
              click: () => onPick(isPinned ? "" : id3),
            } : undefined}
          />
        );
      })}
    </>
  );
};

RadarSitePicker.propTypes = {
  activeSite: PropTypes.string,
  pinnedSite: PropTypes.string,
  status: PropTypes.object,
  interactive: PropTypes.bool,
  onPick: PropTypes.func.isRequired,
};

export default RadarSitePicker;
