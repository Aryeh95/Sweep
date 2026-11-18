import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";

/**
 * Initialise i18next after any standalone / embed storage shims are in place.
 *
 * Deferred out of module evaluation because ESM hoists static imports ahead of
 * `installEmbed(axios)` in `src/index.js`: running `LanguageDetector` at import
 * time touched the real `window.localStorage` before the embed's in-memory
 * `Storage` replaced it (throwing `SecurityError` in cookie-blocked iframes).
 *
 * @returns {import("i18next").i18n} the configured i18next singleton
 */
export function initI18n() {
  if (i18n.isInitialized) return i18n;
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        fr: { translation: fr },
        es: { translation: es },
      },
      fallbackLng: "en",
      supportedLngs: ["en", "fr", "es"],
      load: "languageOnly",
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "i18nextLng",
        caches: ["localStorage"],
      },
      interpolation: {
        escapeValue: false,
      },
    });
  return i18n;
}

export default i18n;
