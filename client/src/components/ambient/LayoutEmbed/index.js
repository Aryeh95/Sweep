import React, { useContext } from "react";
import { UiPrefsContext } from "~/AppContext";
import WeatherMap from "~/components/WeatherMap";
import styles from "./styles.css";

/**
 * Embed layout (see ui/embed.js): the map, edge to edge, and nothing
 * else. No layout sentinel is set, so WeatherMap draws no focus toggle,
 * and its own controls are gated on EMBED inside the map.
 *
 * @returns {JSX.Element} embed layout
 */
const LayoutEmbed = () => {
  const { darkMode, defaultMapZoom } = useContext(UiPrefsContext);
  return (
    <div className={`${styles.mapArea} map-container ${darkMode ? "map-dark-mode" : ""}`}>
      <WeatherMap zoom={defaultMapZoom} dark={darkMode} />
    </div>
  );
};

export default LayoutEmbed;
