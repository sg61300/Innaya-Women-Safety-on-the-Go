// Task 28 (ADR-035): siren + spoken prompt on expo-audio. Native audio, volume,
// speech and intent modules are mocked (R32: device audio not verified here).
const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockSeek = jest.fn();
const mockRemove = jest.fn();
const mockPlayer = { play: mockPlay, pause: mockPause, seekTo: mockSeek, remove: mockRemove, loop: false };
const mockSetVol = jest.fn();
const mockGetVol = jest.fn();
const mockSpeak = jest.fn();
const mockStartActivity = jest.fn();
const mockSetAudioMode = jest.fn();
// F8a: the loud alarm-channel notification burst.
const mockGetChannel = jest.fn();
const mockSetChannel = jest.fn();
const mockSchedule = jest.fn();
const mockDismiss = jest.fn();

// jest hoists jest.mock above the ES imports, so the factories read the mock
// objects LAZILY (at call time) — embedding the fn refs directly would capture
// them while still uninitialised. Same lazy pattern as permissions.test.ts.
jest.mock("expo-audio", () => ({
  createAudioPlayer: () => mockPlayer,
  setAudioModeAsync: (...a: unknown[]) => mockSetAudioMode(...a),
}));
jest.mock("react-native-volume-manager", () => ({
  VolumeManager: {
    setVolume: (...a: unknown[]) => mockSetVol(...a),
    getVolume: (...a: unknown[]) => mockGetVol(...a),
  },
}));
jest.mock("expo-speech", () => ({ speak: (...a: unknown[]) => mockSpeak(...a) }));
jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: (...a: unknown[]) => mockStartActivity(...a),
}));
jest.mock("expo-notifications", () => ({
  getNotificationChannelAsync: (...a: unknown[]) => mockGetChannel(...a),
  setNotificationChannelAsync: (...a: unknown[]) => mockSetChannel(...a),
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...a),
  dismissNotificationAsync: (...a: unknown[]) => mockDismiss(...a),
  AndroidNotificationPriority: { MAX: "max" },
  AndroidImportance: { MAX: 5 },
  AndroidAudioUsage: { ALARM: 4 },
  AndroidAudioContentType: { SONIFICATION: 5 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));
// Only the id is needed; avoid importing the native modules permissions.ts pulls in.
jest.mock("../lib/permissions", () => ({ ALARM_CHANNEL_ID: "vaira-alarm-2" }));
jest.mock("../../assets/siren.mp3", () => 1, { virtual: true });
// F2: capture the diagnostic events.
const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a), flush: jest.fn() } }));

import { Platform } from "react-native";
import { siren } from "../services/siren";
import { useSession } from "../store/session";
import { useJourney } from "../store/journey";

beforeEach(() => {
  jest.clearAllMocks();
  mockPlayer.loop = false;
  mockGetVol.mockResolvedValue({ volume: 1 });
  (Platform as { OS: string }).OS = "android";
  mockGetChannel.mockResolvedValue(null); // default: no -2 channel
  mockSchedule.mockResolvedValue("notif-1");
  const ctx = useJourney.getState().ctx;
  useJourney.getState().set({ ctx: { ...ctx, alarmMode: undefined } as never }); // no leaked silent mode
});
afterEach(async () => {
  await siren.stop(); // clear the module-level player ref between tests
});

test("start sets silent-mode audio, forces volume to max, loops and plays", async () => {
  await siren.start();
  expect(mockSetAudioMode).toHaveBeenCalledWith({
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  });
  expect(mockSetVol).toHaveBeenCalledWith(1);
  expect(mockPlayer.loop).toBe(true);
  expect(mockPlay).toHaveBeenCalled();
});

test("F2: start logs siren_started and marks the store playing on success", async () => {
  await siren.start();
  const started = mockLog.mock.calls.find((c) => c[0] === "siren_started");
  expect(started).toBeTruthy();
  expect(started![1]).toEqual(expect.objectContaining({ playsInSilentMode: true, stream: "media+alarmChannel" }));
  expect(useJourney.getState().sirenStatus).toBe("playing");
});

test("F2: a failing audio stage logs siren_error {stage} and marks the store error", async () => {
  mockSetAudioMode.mockRejectedValueOnce(new Error("audio focus denied"));
  await expect(siren.start()).rejects.toThrow("audio focus denied");
  const err = mockLog.mock.calls.find((c) => c[0] === "siren_error");
  expect(err).toBeTruthy();
  expect(err![1]).toEqual(expect.objectContaining({ stage: "setAudioMode", message: "audio focus denied" }));
  expect(useJourney.getState().sirenStatus).toBe("error");
});

test("start is idempotent while a siren is already playing", async () => {
  await siren.start();
  await siren.start();
  expect(mockPlay).toHaveBeenCalledTimes(1);
});

test("stop pauses, rewinds and unloads the player", async () => {
  await siren.start();
  await siren.stop();
  expect(mockPause).toHaveBeenCalled();
  expect(mockSeek).toHaveBeenCalledWith(0);
  expect(mockRemove).toHaveBeenCalled();
});

test("stop is a no-op when nothing is playing", async () => {
  await siren.stop();
  expect(mockPause).not.toHaveBeenCalled();
});

test("speak forces volume and speaks in the profile language", async () => {
  useSession.getState().set({ profile: { language: "hi" } });
  await siren.speak("नमस्ते");
  expect(mockSetVol).toHaveBeenCalledWith(1);
  expect(mockSpeak).toHaveBeenCalledWith(
    "नमस्ते",
    expect.objectContaining({ language: "hi-IN", rate: 0.95 })
  );
});

test("speak defaults to en-IN when no profile language is set", async () => {
  useSession.getState().set({ profile: null });
  await siren.speak("hello");
  expect(mockSpeak).toHaveBeenCalledWith(
    "hello",
    expect.objectContaining({ language: "en-IN", rate: 0.95 })
  );
});

test("speakPrompt speaks the i18n ARE-YOU-SAFE copy", async () => {
  useSession.getState().set({ profile: null });
  await siren.speakPrompt();
  expect(mockSpeak).toHaveBeenCalledWith(
    "Are you safe? Say your safe word.",
    expect.objectContaining({ language: "en-IN", rate: 0.95 })
  );
});

test("start snapshots the user volume and stop restores it (B4)", async () => {
  mockGetVol.mockResolvedValue({ volume: 0.3 });
  await siren.start();
  await siren.stop();
  expect(mockSetVol).toHaveBeenLastCalledWith(0.3); // restored last, after release
});

test("a stop() whose remove() throws still allows a restart (B4)", async () => {
  await siren.start();
  mockRemove.mockImplementationOnce(() => {
    throw new Error("native remove failed");
  });
  await siren.stop().catch(() => {}); // player ref cleared despite the throw
  await siren.start();
  expect(mockPlay).toHaveBeenCalledTimes(2);
});

test("speak restores the snapshotted volume on completion (B4)", async () => {
  mockGetVol.mockResolvedValue({ volume: 0.2 });
  useSession.getState().set({ profile: null });
  await siren.speak("hello");
  expect(mockSetVol).toHaveBeenCalledWith(1);
  const opts = mockSpeak.mock.calls[0][1];
  await opts.onDone();
  expect(mockSetVol).toHaveBeenLastCalledWith(0.2);
});

test("requestDndAccess opens the notification-policy settings", async () => {
  (Platform as { OS: string }).OS = "android";
  await siren.requestDndAccess();
  expect(mockStartActivity).toHaveBeenCalledWith(
    "android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS"
  );
});

test("hold() pauses, then start() resumes the same player without rebuilding it (Task 29b)", async () => {
  await siren.start();
  expect(mockPlay).toHaveBeenCalledTimes(1);
  await siren.hold();
  expect(mockPause).toHaveBeenCalledTimes(1);
  await siren.start(); // resume
  expect(mockPlay).toHaveBeenCalledTimes(2);
  expect(mockRemove).not.toHaveBeenCalled(); // player kept, never rebuilt
  expect(mockSetVol).toHaveBeenCalledTimes(1); // volume forced once, not again on resume
});

test("hold() is a no-op when nothing is playing (Task 29b)", async () => {
  await siren.hold();
  expect(mockPause).not.toHaveBeenCalled();
});

test("stop() after a hold clears held and restores volume (Task 29b)", async () => {
  mockGetVol.mockResolvedValue({ volume: 0.4 });
  await siren.start();
  await siren.hold();
  await siren.stop();
  expect(mockRemove).toHaveBeenCalled();
  expect(mockSetVol).toHaveBeenLastCalledWith(0.4);
  // after a full stop, a fresh start rebuilds the player (held was cleared)
  await siren.start();
  expect(mockPlay).toHaveBeenCalledTimes(2);
});

test("requestDndAccess is a no-op off Android (B4)", async () => {
  (Platform as { OS: string }).OS = "ios";
  await siren.requestDndAccess();
  expect(mockStartActivity).not.toHaveBeenCalled();
});

// ---- F8a guard tests (founder live test 2026-09-07) -------------------------
// The siren service has no journey dependency, so these assertions hold for a
// CRITICAL raised from ANY state, including SOS from Home while NOT travelling.

test("F8a: start posts a loud alarm-channel notification with siren.mp3", async () => {
  await siren.start();
  expect(mockSchedule).toHaveBeenCalledTimes(1);
  const arg = mockSchedule.mock.calls[0][0];
  expect(arg.content.sound).toBe("siren.mp3");
  expect(arg.trigger.channelId).toBe("vaira-alarm"); // base channel when -2 absent
});

test("F8a: creates the base alarm channel (ALARM stream + siren.mp3) when missing", async () => {
  mockGetChannel.mockResolvedValue(null); // neither -2 nor base exists
  await siren.start();
  expect(mockSetChannel).toHaveBeenCalledTimes(1);
  const [id, cfg] = mockSetChannel.mock.calls[0];
  expect(id).toBe("vaira-alarm");
  expect(cfg.sound).toBe("siren.mp3");
  expect(cfg.audioAttributes.usage).toBe(4); // AndroidAudioUsage.ALARM
});

test("F8a: does not recreate the base channel when it already exists", async () => {
  mockGetChannel.mockResolvedValue({ id: "vaira-alarm" }); // base present, -2 absent handled below
  mockGetChannel.mockResolvedValueOnce(null); // -2 missing
  await siren.start();
  expect(mockSetChannel).not.toHaveBeenCalled();
  expect(mockSchedule.mock.calls[0][0].trigger.channelId).toBe("vaira-alarm");
});

test("F8a: uses the DND-bypassing -2 channel when it exists", async () => {
  mockGetChannel.mockResolvedValueOnce({ id: "vaira-alarm-2", bypassDnd: true });
  await siren.start();
  expect(mockSchedule.mock.calls[0][0].trigger.channelId).toBe("vaira-alarm-2");
  expect(mockSetChannel).not.toHaveBeenCalled(); // -2 present, no base creation
});

test("F8a: stop dismisses the alarm notification", async () => {
  await siren.start();
  await siren.stop();
  expect(mockDismiss).toHaveBeenCalledWith("notif-1");
});

test("F8a: a notification failure never blocks the audio player", async () => {
  mockSchedule.mockRejectedValueOnce(new Error("channel gone"));
  await siren.start();
  expect(mockPlay).toHaveBeenCalled(); // player still started
});

test("F8a: no notification is posted off Android (player still plays)", async () => {
  (Platform as { OS: string }).OS = "ios";
  await siren.start();
  expect(mockSchedule).not.toHaveBeenCalled();
  expect(mockPlay).toHaveBeenCalled();
});

// ---- ADR-043 item 3: silent mode never sounds on the wearer's own phone ------

test("ADR-043: start() makes no sound when alarmMode is silent", async () => {
  const ctx = useJourney.getState().ctx;
  useJourney.getState().set({ ctx: { ...ctx, alarmMode: "silent" } as never });
  await siren.start();
  expect(mockPlay).not.toHaveBeenCalled();
  expect(mockSetAudioMode).not.toHaveBeenCalled();
  expect(mockSetVol).not.toHaveBeenCalled();
  expect(mockSchedule).not.toHaveBeenCalled(); // no loud alarm-channel burst either
  expect(mockLog).toHaveBeenCalledWith("siren_suppressed_silent", {});
});

test("ADR-043: start() plays normally when alarmMode is siren", async () => {
  const ctx = useJourney.getState().ctx;
  useJourney.getState().set({ ctx: { ...ctx, alarmMode: "siren" } as never });
  await siren.start();
  expect(mockPlay).toHaveBeenCalledTimes(1);
});
