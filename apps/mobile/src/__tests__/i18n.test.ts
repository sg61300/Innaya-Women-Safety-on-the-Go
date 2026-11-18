jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

import i18n, { setLanguage } from "../i18n";

test("all three locales define every key of en.json", () => {
  const en = i18n.getResourceBundle("en", "translation");
  const hi = i18n.getResourceBundle("hi", "translation");
  const kn = i18n.getResourceBundle("kn", "translation");
  for (const k of Object.keys(en)) {
    expect(hi[k]).toBeTruthy();
    expect(kn[k]).toBeTruthy();
  }
});

// T4: {{placeholder}} tokens must match en.json exactly in hi/kn, or i18next
// interpolation silently drops a value (e.g. a guardian name or countdown).
test("hi and kn placeholders match en for every key", () => {
  const flat = (o: Record<string, any>, p = "", acc: Record<string, string> = {}) => {
    for (const k of Object.keys(o)) {
      const key = p ? `${p}.${k}` : k;
      const v = o[k];
      if (v && typeof v === "object") flat(v, key, acc);
      else acc[key] = String(v);
    }
    return acc;
  };
  const ph = (s: string) => [...s.matchAll(/\{\{(.*?)\}\}/g)].map((m) => m[1].trim()).sort();
  const en = flat(i18n.getResourceBundle("en", "translation"));
  const hi = flat(i18n.getResourceBundle("hi", "translation"));
  const kn = flat(i18n.getResourceBundle("kn", "translation"));
  for (const k of Object.keys(en)) {
    expect({ key: k, ph: ph(hi[k] ?? "") }).toEqual({ key: k, ph: ph(en[k]) });
    expect({ key: k, ph: ph(kn[k] ?? "") }).toEqual({ key: k, ph: ph(en[k]) });
  }
});

test("setLanguage switches t()", async () => {
  await setLanguage("hi");
  expect(i18n.t("dashboard.firstLogin")).not.toBe(
    i18n.getResourceBundle("en", "translation")["dashboard.firstLogin"]
  );
});
