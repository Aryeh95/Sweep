// Drop-in for react-leaflet's `useMapEvents` whose listeners stay attached.
//
// `useMapEvents(handlers)` re-subscribes whenever the handlers object
// changes — and an inline object literal changes on every render. React
// runs all of a commit's effect cleanups before any new effect, in tree
// order, so an event a sibling's effect fires during that commit (a
// programmatic pan, zoom or fitBounds) reaches a component whose listener
// is momentarily detached, and is lost. Found 2026-10-11: the locate
// button's pan to a new city fired `moveend` in that gap, so the view
// tracker kept the old city and the radar stayed on the old site; the
// MRMS mosaic (repaints on `moveend`) and the zoom tracker (`zoomend`)
// were exposed the same way.
//
// Here the listeners are bound once per set of event NAMES and call the
// latest handler through a ref, so a re-render never opens that gap.

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

/**
 * Subscribe to Leaflet map events with listeners that survive re-renders.
 *
 * @param {Object<string, Function>} handlers event name → handler
 * @returns {import("leaflet").Map} the map, like `useMapEvents`
 */
export default function useStableMapEvents(handlers) {
  const map = useMap();
  const latest = useRef(handlers);
  latest.current = handlers;
  const names = Object.keys(handlers).sort().join(" ");

  useEffect(() => {
    const bound = {};
    names.split(" ").filter(Boolean).forEach((name) => {
      bound[name] = (e) => {
        const fn = latest.current[name];
        if (fn) fn(e);
      };
    });
    map.on(bound);
    return () => map.off(bound);
  }, [map, names]);

  return map;
}
