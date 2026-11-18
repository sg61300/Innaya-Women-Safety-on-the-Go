import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { Text } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ThemeProvider } from "../theme";
import { TourProvider } from "../components/tour/TourProvider";

// profile-cards (founder 2026-09-07): the app-password gate now lives in
// ProfileGate, which wraps the whole nested profile Stack in _layout.tsx — so it
// covers every child route, including a `?section=<name>` deep link resolved by
// index. Logout stays on the card list (index). These exercise both beyond the
// happy path: a wrong password, and the full sign-out + secret wipe.

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: jest.fn(), push: jest.fn(), replace: mockReplace }),
  router: { navigate: jest.fn(), push: jest.fn(), replace: mockReplace, back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

const mockSignOut = jest.fn().mockResolvedValue({ error: null });
jest.mock("../lib/supabase", () => {
  const chain: any = {};
  for (const m of ["select", "eq", "order", "update"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve({ data: { emergency_password_hash: null }, error: null });
  chain.then = (res: any) => Promise.resolve({ data: [], error: null }).then(res);
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1", email: "a@b.co" } } }), signOut: () => mockSignOut() },
      from: () => chain,
    },
  };
});

// A local app-password hash exists → the gate must challenge. verifyPassword is
// wrong once, then right.
const mockHasAppPassword = jest.fn().mockResolvedValue(true);
jest.mock("../services/appPassword", () => ({
  hasAppPassword: () => mockHasAppPassword(),
  resolveAccountEmail: jest.fn().mockResolvedValue("a@b.co"),
}));
const mockVerify = jest.fn();
jest.mock("../services/gates", () => ({ gates: { verifyPassword: (...a: unknown[]) => mockVerify(...a) } }));

import { ProfileGate } from "../components/ProfileGate";
import ProfileIndex from "../../app/(user)/profile/index";
import LanguageScreen from "../../app/(user)/profile/language";
import i18n, { setLanguage } from "../i18n";

jest.setTimeout(120_000);
const wrap = (node: React.ReactElement) => render(<ThemeProvider initial="midnight"><TourProvider>{node}</TourProvider></ThemeProvider>);
const press = (get: (id: string) => unknown, id: string) => act(async () => { fireEvent.press(get(id) as never); });
const type = (get: (id: string) => unknown, id: string, t: string) => act(async () => { fireEvent.changeText(get(id) as never, t); });

beforeEach(() => jest.clearAllMocks());

// The gate wraps the Stack, so a deep-linked child (represented here by a
// sentinel node behind the gate) is not reachable until the password is right.
test("gate covers a deep-linked child: rejects a wrong password, then unlocks", async () => {
  mockHasAppPassword.mockResolvedValue(true);
  mockVerify.mockResolvedValueOnce({ ok: false, reason: "wrong" }).mockResolvedValueOnce({ ok: true });
  const { getByTestId, queryByTestId } = await wrap(
    <ProfileGate><Text testID="deep-link-child">child</Text></ProfileGate>
  );
  await act(async () => {});
  // Locked: the gate is shown and the child behind it is not.
  getByTestId("profile-gate");
  expect(queryByTestId("deep-link-child")).toBeNull();
  // Wrong password: an error, still locked.
  await type(getByTestId, "profile-gate-input", "nope");
  await press(getByTestId, "profile-gate-submit");
  getByTestId("profile-gate-msg");
  expect(queryByTestId("deep-link-child")).toBeNull();
  // Right password: the child (deep-link target) is now reachable.
  await type(getByTestId, "profile-gate-input", "correct");
  await press(getByTestId, "profile-gate-submit");
  getByTestId("deep-link-child");
});

test("missing local hash still requires the app password and uses the live verifier", async () => {
  mockHasAppPassword.mockResolvedValue(false);
  mockVerify.mockResolvedValueOnce({ ok: true });
  const { getByTestId, queryByTestId } = await wrap(
    <ProfileGate><Text testID="deep-link-child">child</Text></ProfileGate>
  );
  await act(async () => {});
  getByTestId("profile-gate");
  expect(queryByTestId("deep-link-child")).toBeNull();
  await type(getByTestId, "profile-gate-input", "account-password");
  await press(getByTestId, "profile-gate-submit");
  getByTestId("deep-link-child");
});

test("logout signs out, wipes the three device secrets, and routes to login", async () => {
  const del = jest.spyOn(SecureStore, "deleteItemAsync").mockResolvedValue(undefined as never);
  const { getByTestId } = await wrap(<ProfileIndex />);
  await act(async () => {});
  await press(getByTestId, "profile-logout");
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  for (const k of ["vaira.app_password_hash", "vaira.device_salt", "vaira.account_email"]) expect(del).toHaveBeenCalledWith(k);
  expect(mockReplace).toHaveBeenCalledWith("/(auth)/login");
  del.mockRestore();
});

// F15: the language selector switches i18n in place.
test("language selector switches the app language", async () => {
  await act(async () => { await setLanguage("en"); });
  const { getByTestId } = await wrap(<LanguageScreen />);
  await act(async () => {});
  await press(getByTestId, "profile-lang-hi");
  expect(i18n.language).toBe("hi");
  await act(async () => { await setLanguage("en"); }); // reset for other suites
});
