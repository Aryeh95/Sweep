import React from "react";
import { createRoot } from "react-dom/client";
import App from "~/components/App";
import ErrorBoundary from "~/components/ErrorBoundary";
import { AppContextProvider } from "~/AppContext";
import installStandaloneApi from "~/standalone/install";
import axios from "axios";
import { EMBED, installEmbed } from "~/ui/embed";
import { initI18n } from "~/i18n";
import "~/styles";

// App build (Android): there is no server behind this bundle, so the API the
// hooks call is served in-process by the ported controllers. Installed before
// the first render so no poller can fire against the real network adapter
// and log a failure on the way past. `__STANDALONE__` is a compile-time
// constant, so the kiosk bundle drops this branch and the import with it.
if (__STANDALONE__) {
  installStandaloneApi();
  document.documentElement.setAttribute("data-shell", "app");
}

// Browser hint for CSS-level performance opt-outs (see styles/main.css:
// Firefox pays dearly for backdrop blur over a moving map). A data
// attribute rather than a UA-sniffing class in React so it applies before
// the first paint and never re-renders anything.
// Embed mode (ui/embed.js): before the first render, so every preference
// read sees the embed's in-memory storage and no write can leave.
if (EMBED.on) installEmbed(axios);

// Initialise i18next AFTER `installEmbed` has swapped `window.localStorage`,
// so `i18next-browser-languagedetector` reads the in-memory storage rather
// than throwing `SecurityError` in third-party iframes.
initI18n();

if (typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent)) {
  document.documentElement.setAttribute("data-browser", "firefox");
}

const root = createRoot(document.getElementById("root"));
root.render(
  <ErrorBoundary label="root">
    <AppContextProvider>
      <App />
    </AppContextProvider>
  </ErrorBoundary>
);
