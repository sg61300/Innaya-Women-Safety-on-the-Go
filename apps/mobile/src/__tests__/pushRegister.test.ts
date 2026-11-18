import { Platform } from "react-native";
// Force android so the channel-creation branch runs (mirrors permissionsScreen.test).
Platform.OS = "android";

const mockLog = jest.fn((..._a: unknown[]) => Promise.resolve());
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

jest.mock("../i18n", () => ({ __esModule: true, default: { t: (k: string) => k } }));
jest.mock("../lib/permissions", () => ({ ALARM_CHANNEL_ID: "vaira-alarm-2" }));

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
const mockMaybeSingle = jest.fn((..._a: unknown[]) => Promise.resolve({ data: { loud_override: false } }));
const mockSelectEq = jest.fn((..._a: unknown[]) => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn((..._a: unknown[]) => ({ eq: mockSelectEq }));
const mockFrom = jest.fn((..._a: unknown[]) => ({ update: mockUpdate, select: mockSelect }));
jest.mock("../lib/supabase", () => ({
  supabase: { auth: { getUser: (...a: unknown[]) => mockGetUser(...a) }, from: (...a: unknown[]) => mockFrom(...a) },
}));

import { registerPush } from "../services/push";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPerms.mockResolvedValue({ granted: true } as never);
  mockGetToken.mockResolvedValue({ data: "expo-tok" } as never);
});

// G2 fix: the whole point — when permission is granted and a session exists, the
// token is fetched and written to profiles.expo_push_token, and success is logged.
it("writes the token and logs push_register ok when permission is granted", async () => {
  await registerPush();
  expect(mockGetToken).toHaveBeenCalled();
  expect(mockFrom).toHaveBeenCalledWith("profiles");
  expect(mockUpdate).toHaveBeenCalledWith({ expo_push_token: "expo-tok" });
  expect(mockEq).toHaveBeenCalledWith("id", "u1");
  expect(mockLog).toHaveBeenCalledWith("push_register", { ok: true, reason: "ok" });
});

// G2 root cause guard: without notification permission the token must NOT be
// fetched or written, and the reason must be logged so a null token is traceable.
it("skips the token and logs permission_not_granted when permission is denied", async () => {
  mockGetPerms.mockResolvedValueOnce({ granted: false } as never);
  await registerPush();
  expect(mockGetToken).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockLog).toHaveBeenCalledWith("push_register", { ok: false, reason: "permission_not_granted" });
  // Channels are still set up regardless of permission.
  expect(mockSetChannel).toHaveBeenCalledWith("vaira-alerts", expect.anything());
});

// A failed profile update is reported (ok:false) rather than silently swallowed.
it("logs ok:false when the profile update errors", async () => {
  mockEq.mockResolvedValueOnce({ error: { message: "rls" } } as never);
  await registerPush();
  expect(mockLog).toHaveBeenCalledWith("push_register", { ok: false, reason: "update_failed" });
});
