import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { AppState, Platform } from "react-native";
import { ThemeProvider } from "../theme";

// Pre-35 item C (R43): toggling "always alert me loudly" writes loud_override
// to the profile (keeping the AsyncStorage cache), and a DB value is preferred
// on mount.
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// F1/D2: the loud-override toggle must pierce Do Not Disturb. Mock the alarm
// channel + intent-launcher so the DnD flow can be driven without native code.
jest.mock("../lib/permissions", () => ({ ALARM_CHANNEL_ID: "vaira-alarm-2" }));
const mockGetChannel = jest.fn();
const mockSetChannel = jest.fn().mockResolvedValue(undefined);
jest.mock("expo-notifications", () => ({
  getNotificationChannelAsync: (...a: unknown[]) => mockGetChannel(...a),
  setNotificationChannelAsync: (...a: unknown[]) => mockSetChannel(...a),
  AndroidImportance: { MAX: 5 },
  AndroidAudioUsage: { ALARM: 4 },
  AndroidAudioContentType: { SONIFICATION: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));
const mockStartActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: (...a: unknown[]) => mockStartActivity(...a),
  ActivityAction: { NOTIFICATION_POLICY_ACCESS_SETTINGS: "android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS" },
}));

// The DnD flow is Android-only. Force the platform per-test (a forced-android
// host renders the Switch value prop differently, so the non-DnD tests must stay
// on the default platform).
let osValue = "ios";
Object.defineProperty(Platform, "OS", { configurable: true, get: () => osValue });

// Capture the AppState "change" handler so a return from settings can be simulated.
let appStateHandler: ((s: string) => void) | null = null;
jest.spyOn(AppState, "addEventListener").mockImplementation(((_t: string, cb: (s: string) => void) => {
  appStateHandler = cb;
  return { remove: jest.fn() };
}) as never);

const mockUpdate = jest.fn(() => ({ eq: (...a: unknown[]) => (mockEq as any)(...a) }));
const mockEq = jest.fn(() => Promise.resolve({ error: null }));
let mockProfile: any = { name: "G", phone: "9", loud_override: false };
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "g1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: mockProfile }) }) }),
      update: (...a: unknown[]) => (mockUpdate as any)(...a),
    }),
  },
}));

import GuardianProfile from "../../app/(guardian)/profile";

const mount = async () => {
  const u = await render(<ThemeProvider><GuardianProfile /></ThemeProvider>);
  await act(async () => {});
  return u;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = { name: "G", phone: "9", loud_override: false };
  appStateHandler = null;
  osValue = "ios";
  mockGetChannel.mockReset();
});

test("toggling on writes loud_override:true to the profile", async () => {
  const { getByTestId } = await mount();
  await act(async () => {
    fireEvent(getByTestId("guardian-loud-switch"), "valueChange", true);
  });
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ loud_override: true }));
  expect(mockEq).toHaveBeenCalledWith("id", "g1");
});

test("prefers the DB value on mount", async () => {
  mockProfile = { name: "G", phone: "9", loud_override: true };
  const { getByTestId } = await mount();
  expect(getByTestId("guardian-loud-switch").props.value).toBe(true);
});

// F1/D2: enabling the override when the alarm channel cannot yet pierce DnD must
// send the guardian to the notification-policy settings screen.
test("enabling with no policy access opens the DnD settings intent", async () => {
  osValue = "android";
  mockGetChannel.mockResolvedValue(undefined); // migration channel not created yet
  const { getByTestId } = await mount();
  await act(async () => { fireEvent(getByTestId("guardian-loud-switch"), "valueChange", true); });
  await waitFor(() =>
    expect(mockStartActivity).toHaveBeenCalledWith("android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS"),
  );
});

// F1/D2: on return from settings WITH access, the channel is (re)created with
// bypassDnd and no denial caption is shown.
test("returning with access re-creates the alarm channel with bypassDnd", async () => {
  osValue = "android";
  mockGetChannel
    .mockResolvedValueOnce(undefined)            // ensureDndBypass: channel absent
    .mockResolvedValueOnce({ bypassDnd: true });  // finishDndBypass read-back: granted
  const { getByTestId, queryByTestId } = await mount();
  await act(async () => { fireEvent(getByTestId("guardian-loud-switch"), "valueChange", true); });
  await waitFor(() => expect(mockStartActivity).toHaveBeenCalled());
  await act(async () => { appStateHandler?.("active"); });
  await waitFor(() =>
    expect(mockSetChannel).toHaveBeenCalledWith("vaira-alarm-2", expect.objectContaining({ bypassDnd: true })),
  );
  expect(queryByTestId("guardian-loud-dnd-denied")).toBeNull();
});

// T2-F1: enabling when the -2 channel does not exist and the settings intent
// throws must NOT write loud_override:true — the api would send the alarm push to
// a channel that does not exist on the device and Android would drop it.
test("toggle on with the intent throwing never writes loud_override:true", async () => {
  osValue = "android";
  mockGetChannel.mockResolvedValue(undefined); // channel absent
  mockStartActivity.mockRejectedValueOnce(new Error("no activity"));
  const { getByTestId, findByTestId } = await mount();
  await act(async () => { fireEvent(getByTestId("guardian-loud-switch"), "valueChange", true); });
  await findByTestId("guardian-loud-dnd-denied");
  expect(mockUpdate).not.toHaveBeenCalledWith({ loud_override: true });
});

// T2-F1: on return from settings with the channel now present, the profile write
// finally happens (loud_override:true), so the api can route the loud push.
test("toggle on then return with the channel present writes loud_override:true", async () => {
  osValue = "android";
  mockGetChannel
    .mockResolvedValueOnce(undefined)            // ensureDndBypass: absent → open settings
    .mockResolvedValueOnce({ bypassDnd: true });  // finishDndBypass: created + granted
  const { getByTestId } = await mount();
  await act(async () => { fireEvent(getByTestId("guardian-loud-switch"), "valueChange", true); });
  await waitFor(() => expect(mockStartActivity).toHaveBeenCalled());
  // No write yet — the channel did not exist when the toggle flipped.
  expect(mockUpdate).not.toHaveBeenCalledWith({ loud_override: true });
  await act(async () => { appStateHandler?.("active"); });
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ loud_override: true }));
});

// T2-F1: turning the override OFF persists loud_override:false immediately (no
// channel gate — a dropped "off" is harmless).
test("toggle off writes loud_override:false immediately", async () => {
  const { getByTestId } = await mount();
  await act(async () => { fireEvent(getByTestId("guardian-loud-switch"), "valueChange", false); });
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ loud_override: false }));
});

// F1/D2: on return WITHOUT access, the toggle stays on but the "DnD will still
// silence the alarm" caption is shown.
test("returning without access keeps the toggle on and shows the DnD caption", async () => {
  osValue = "android";
  mockGetChannel
    .mockResolvedValueOnce(undefined)             // ensureDndBypass: channel absent
    .mockResolvedValueOnce({ bypassDnd: false });  // read-back: access still denied
  const { getByTestId, findByTestId } = await mount();
  await act(async () => { fireEvent(getByTestId("guardian-loud-switch"), "valueChange", true); });
  await waitFor(() => expect(mockStartActivity).toHaveBeenCalled());
  await act(async () => { appStateHandler?.("active"); });
  // Denial caption shown; the toggle was never turned back off (no setLoud(false)
  // on this path), and the explain caption stays in place.
  await findByTestId("guardian-loud-dnd-denied");
  getByTestId("guardian-loud-dnd-explain");
});
