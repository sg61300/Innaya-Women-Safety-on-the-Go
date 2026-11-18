// hi/kn strings machine-drafted 2026-09-04, native-speaker review pending (Task 35 QA row)
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "./en.json";
import hi from "./hi.json";
import kn from "./kn.json";

export type Lang = "en" | "hi" | "kn";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "kn", label: "ಕನ್ನಡ" },
];

// Device locale is a best-effort default only. expo-localization is a native
// module; on a JS bundle hot-loaded onto an APK that predates it, getLocales()
// is unavailable — fall back to English rather than crash at startup.
function deviceDefault(): Lang {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const code = require("expo-localization").getLocales()[0]?.languageCode;
    return code === "hi" || code === "kn" ? code : "en";
  } catch {
    return "en";
  }
}

// Keys are flat and contain dots (e.g. "dashboard.firstLogin"), so key/ns
// separators must be off or i18next would treat the dot as nesting.
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    kn: { translation: kn },
  },
  lng: deviceDefault(),
  fallbackLng: "en",
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

// Persisted for the next launch and read by TTS/STT (Tasks 25, 28). The stored
// value is loaded into i18n on startup by the root index route.
export async function setLanguage(code: Lang) {
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem("vaira.language", code);
}

export default i18n;
