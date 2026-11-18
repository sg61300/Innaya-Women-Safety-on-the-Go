import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Share } from "react-native";
import { ThemeProvider } from "../theme";
import { TourProvider } from "../components/tour/TourProvider";
import PrivacyScreen, { PROFILE_EXPORT_COLUMNS } from "../../app/(user)/profile/privacy";

// Task 34 F1 (secret exposure): "Download my data" must export an explicit
// allowlist of non-secret columns, never `select("*")` — which would leak
// emergency_password_hash / word_salt / password_fail_count / locked_until
// through the OS share sheet. profile-cards moved this onto the Privacy child.

jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock("../services/history", () => ({
  falseAlarmRate: jest.fn(),
  history: { journeys: jest.fn().mockResolvedValue([]), alerts: jest.fn(), feedback: jest.fn(), timeline: jest.fn() },
}));

const mockSelectCol = jest.fn();
jest.mock("../lib/supabase", () => {
  const chain: any = {};
  chain.select = (...a: any[]) => { mockSelectCol(...a); return chain; };
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.update = () => chain;
  chain.single = () => Promise.resolve({ data: { id: "u1", name: "A" }, error: null });
  chain.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res);
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      from: () => chain,
    },
  };
});

jest.setTimeout(120_000);

const wrap = () =>
  render(<ThemeProvider initial="midnight"><TourProvider><PrivacyScreen /></TourProvider></ThemeProvider>);

const tap = (get: (id: string) => unknown, id: string) =>
  act(async () => { fireEvent.press(get(id) as never); });

test("export allowlist is not a wildcard and excludes every secret column", () => {
  expect(PROFILE_EXPORT_COLUMNS).not.toContain("*");
  expect(PROFILE_EXPORT_COLUMNS).not.toMatch(/hash|salt|fail_count|locked_until/);
});

test("onDownloadData selects the allowlist columns, never the full row", async () => {
  jest.spyOn(Share, "share").mockResolvedValue({} as never);
  const { getByTestId, findByTestId } = await wrap();
  await findByTestId("privacy-tab");
  await tap(getByTestId, "privacy-download-data");
  expect(mockSelectCol).toHaveBeenCalledWith(PROFILE_EXPORT_COLUMNS);
  expect(mockSelectCol).not.toHaveBeenCalledWith("*");
});
