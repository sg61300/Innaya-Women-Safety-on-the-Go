import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { AppState } from "react-native";
import { ThemeProvider } from "../theme";
import type { Choice } from "../theme/ThemeProvider";

import { Platform } from "react-native";
// The Android notification channels (incl. the D2 loud-override channel) are
// created only on android; force the platform so registerPush takes that path.
Platform.OS = "android";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }));

// Stub the native permission modules so the real lib module can be required
// (they are never invoked — requestStep is replaced below).
jest.mock("expo-audio", () => ({ AudioModule: {} }));
jest.mock("expo-location", () => ({}));
jest.mock("expo-camera", () => ({ Camera: {} }));
jest.mock("expo-intent-launcher", () => ({ ActivityAction: {} }));

// Keep the real PERMISSION_STEPS / canStartJourney; stub only the native request.
const mockRequestStep = jest.fn();
jest.mock("../lib/permissions", () => ({
  ...jest.requireActual("../lib/permissions"),
  requestStep: (...a: unknown[]) => mockRequestStep(...a),
}));

const mockLog = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

const mockSetChannel = jest.fn((..._a: unknown[]) => Promise.resolve());
const mockGetChannel = jest.fn((..._a: unknown[]) => Promise.resolve<any>(null));
const mockGetToken = jest.fn((..._a: unknown[]) => Promise.resolve({ data: "expo-tok" }));
const mockGetPerms = jest.fn((..._a: unknown[]) => Promise.resolve({ granted: true }));
jest.mock("expo-notifications", () => ({
  setNotificationChannelAsync: (...a: unknown[]) => mockSetChannel(...a),
  getNotificationChannelAsync: (...a: unknown[]) => mockGetChannel(...a),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
  getPermissionsAsync: (...a: unknown[]) => mockGetPerms(...a),
  AndroidImportance: { MAX: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  AndroidAudioUsage: { ALARM: 4 },
  AndroidAudioContentType: { SONIFICATION: 4 },
}));

const mockGetUser = jest.fn((..._a: unknown[]) => Promise.resolve({ data: { user: { id: "u1" } } }));
const mockEq = jest.fn((..._a: unknown[]) => Promise.resolve({ error: null }));
const mockUpdate = jest.fn((..._a: unknown[]) => ({ eq: mockEq }));
// T2: profile loud_override read used by registerPush — .select().eq().maybeSingle()
const mockMaybeSingle = jest.fn((..._a: unknown[]) => Promise.resolve({ data: { loud_override: false } }));
const mockSelectEq = jest.fn((..._a: unknown[]) => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn((..._a: unknown[]) => ({ eq: mockSelectEq }));
const mockFrom = jest.fn((..._a: unknown[]) => ({ update: mockUpdate, select: mockSelect }));
jest.mock("../lib/supabase", () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => mockGetUser(...a) }, from: (...a: unknown[]) => mockFrom(...a) },
}));

import Permissions from "../../app/(setup)/permissions";

const PALETTES: Choice[] = ["midnight", "violetBloom"];
const renderScreen = (palette: Choice = "midnight") =>
  render(
    <ThemeProvider initial={palette}>
      <Permissions />
    </ThemeProvider>
  );
const press = (getByTestId: (id: string) => unknown, id: string) =>
  act(async () => {
    fireEvent.press(getByTestId(id) as never);
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestStep.mockResolvedValue("granted");
});

it.each(PALETTES)("renders the first (microphone) step in the %s palette", async (pal) => {
  const { getByText, getByTestId } = await renderScreen(pal);
  getByText("Microphone");
  getByTestId("perm-allow");
  getByTestId("perm-later");
});

// D2 (R43): the loud-override channel must carry ALARM-stream audio attributes
// so the siren still sounds when the phone is in silent mode (the notification
// stream is muted; the alarm stream is not).
it("gives the loud-override channel alarm-stream audio attributes", async () => {
  await renderScreen();
  await act(async () => {}); // flush the mount effect
  const alarmCall = mockSetChannel.mock.calls.find((c) => c[0] === "vaira-alarm");
  expect(alarmCall).toBeTruthy();
  expect(alarmCall![1]).toEqual(
    expect.objectContaining({
      sound: "siren.mp3",
      audioAttributes: { usage: 4, contentType: 4 },
    })
  );
});

// T2 (R43/D2): when the guardian opted into loud override and the DnD-bypassing
// -2 channel is gone (getNotificationChannelAsync → null), registerPush recreates it.
it("recreates the -2 loud channel on start when loud_override is on and it is missing", async () => {
  mockMaybeSingle.mockResolvedValueOnce({ data: { loud_override: true } });
  mockGetChannel.mockResolvedValueOnce(null);
  await renderScreen();
  await act(async () => {});
  const call = mockSetChannel.mock.calls.find((c) => c[0] === "vaira-alarm-2");
  expect(call).toBeTruthy();
  expect(call![1]).toEqual(expect.objectContaining({ bypassDnd: true, sound: "siren.mp3" }));
});

// T2 edge: loud_override on but the channel already exists → do not recreate it.
it("does not recreate the -2 channel when it already exists", async () => {
  mockMaybeSingle.mockResolvedValueOnce({ data: { loud_override: true } });
  mockGetChannel.mockResolvedValueOnce({ id: "vaira-alarm-2", bypassDnd: true });
  await renderScreen();
  await act(async () => {});
  expect(mockSetChannel.mock.calls.find((c) => c[0] === "vaira-alarm-2")).toBeUndefined();
});

// T2 edge: loud_override off → the -2 channel is never created.
it("never creates the -2 channel when loud_override is off", async () => {
  await renderScreen();
  await act(async () => {});
  expect(mockSetChannel.mock.calls.find((c) => c[0] === "vaira-alarm-2")).toBeUndefined();
});

it("registers push on mount (token written to the profile)", async () => {
  await renderScreen();
  await act(async () => {}); // flush the mount effect
  expect(mockGetToken).toHaveBeenCalled();
  expect(mockFrom).toHaveBeenCalledWith("profiles");
  expect(mockUpdate).toHaveBeenCalledWith({ expo_push_token: "expo-tok" });
  expect(mockEq).toHaveBeenCalledWith("id", "u1");
});

it("Allow requests the step, logs the result, and advances", async () => {
  const { getByText, getByTestId } = await renderScreen();
  await act(async () => {}); // settle mount effect
  await press(getByTestId, "perm-allow");
  expect(mockRequestStep).toHaveBeenCalledWith("mic");
  expect(mockLog).toHaveBeenCalledWith("permission", { step: "mic", result: "granted" });
  // advanced to the second step
  getByText("Location");
});

it("Not now logs denied and advances without requesting", async () => {
  const { getByText, getByTestId } = await renderScreen();
  await act(async () => {});
  await press(getByTestId, "perm-later");
  expect(mockRequestStep).not.toHaveBeenCalled();
  expect(mockLog).toHaveBeenCalledWith("permission", { step: "mic", result: "denied" });
  getByText("Location");
});

it("after the last step, routes to the profile setup", async () => {
  const { getByTestId } = await renderScreen();
  await act(async () => {});
  for (let s = 0; s < 5; s++) await press(getByTestId, "perm-allow");
  expect(mockReplace).toHaveBeenCalledWith("/(setup)/profile");
  // Five permission-step results (the mount also logs one push_register event).
  expect(mockLog.mock.calls.filter((c) => c[0] === "permission")).toHaveLength(5);
});

// D1(a): the battery step opens the external battery-optimisation settings; the
// return from that activity raced the surface remount and blanked the screen.
// The final replace must wait until AppState is back to "active".
it("defers the final navigation until the app returns to the foreground", async () => {
  const orig = Object.getOwnPropertyDescriptor(AppState, "currentState");
  const listeners: Array<(s: string) => void> = [];
  const addSpy = jest.spyOn(AppState, "addEventListener").mockImplementation(((_e: string, cb: (s: string) => void) => {
    listeners.push(cb);
    return { remove: jest.fn() };
  }) as never);
  Object.defineProperty(AppState, "currentState", { configurable: true, get: () => "background" });
  try {
    const { getByTestId } = await renderScreen();
    await act(async () => {});
    for (let s = 0; s < 5; s++) await press(getByTestId, "perm-allow");
    // Still resuming: navigation is pending, not performed.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(listeners.length).toBeGreaterThan(0);
    // App comes back to the foreground.
    await act(async () => {
      listeners.forEach((cb) => cb("active"));
    });
    expect(mockReplace).toHaveBeenCalledWith("/(setup)/profile");
  } finally {
    addSpy.mockRestore();
    if (orig) Object.defineProperty(AppState, "currentState", orig);
  }
});
