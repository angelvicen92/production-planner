import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import commonEn from "./locales/en/common.json";
import commonEs from "./locales/es/common.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { common: commonEs },
      en: { common: commonEn },
    },
    defaultNS: "common",
    ns: ["common"],
    lng: "es",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    saveMissing: false,
    missingKeyHandler: (languages, namespace, key) => {
      console.debug("[i18n] missing key", { languages, namespace, key });
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: "pp-language",
      caches: ["localStorage"],
    },
  });

export default i18n;
