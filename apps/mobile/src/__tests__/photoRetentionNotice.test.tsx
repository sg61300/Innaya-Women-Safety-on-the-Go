// Fix lane D6 (founder Q127): she is told photos are kept 30 days, and the button opens
// the existing support email link. Shown on the privacy screen and in the photo prompt.
import { render, fireEvent, act } from "@testing-library/react-native";
import { Linking } from "react-native";
import { ThemeProvider } from "../theme";
import { PrivacyTab } from "../components/PrivacyTab";
import { PhotoRetentionNotice } from "../components/PhotoRetentionNotice";
import { links } from "../lib/links";
import i18n from "../i18n";
import en from "../i18n/en.json";
import hi from "../i18n/hi.json";
import kn from "../i18n/kn.json";
jest.mock("../lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { consent_c7_training: false } }) }) }), update: () => ({ eq: async () => ({ error: null }) }) }) } }));

// Fix lane D7 item 7 (founder Q133, Q127): photos and videos; keep longer or delete sooner by email.
const BODY = "Photos and videos from your trips are kept for 30 days, then deleted. To keep them longer, or to delete them sooner, email us.";

afterEach(() => jest.restoreAllMocks());

test("the notice shows the wording and the button opens the support link", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  const el = await render(<ThemeProvider><PhotoRetentionNotice /></ThemeProvider>);
  el.getByText(BODY);
  expect(el.getByTestId("photo-retention-email")).toHaveTextContent("Email us");
  await act(async () => { fireEvent.press(el.getByTestId("photo-retention-email")); });
  expect(open).toHaveBeenCalledWith(links.support());
});

test("a failed link open is logged, not thrown", async () => {
  jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no mail app"));
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const el = await render(<ThemeProvider><PhotoRetentionNotice /></ThemeProvider>);
  await act(async () => { fireEvent.press(el.getByTestId("photo-retention-email")); });
  expect(warn).toHaveBeenCalledWith("[photoRetention] support link failed", "no mail app");
});

test("the privacy screen shows the notice", async () => {
  const el = await render(<ThemeProvider initial="violetBloom"><PrivacyTab userId="u1" /></ThemeProvider>);
  await el.findByText(BODY);
  el.getByTestId("photo-retention-email");
});

test("the wording exists in en, hi and kn, with no em dash", () => {
  for (const lang of [en, hi, kn] as unknown as Record<string, string>[]) {
    for (const k of ["photoRetention.body", "photoRetention.email"]) {
      expect(lang[k]).toBeTruthy();
      expect(lang[k]).not.toContain("—"); // em dash
    }
  }
  expect(i18n.t("photoRetention.body")).toBe(BODY);
  // D7: hi and kn say videos too (machine-drafted, native review pending).
  expect(hi["photoRetention.body"]).toContain("वीडियो");
  expect(kn["photoRetention.body"]).toContain("ವೀಡಿಯೊ");
});
