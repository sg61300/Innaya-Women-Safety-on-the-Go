// react-native-reanimated (4.x) and its react-native-worklets backend both
// initialise a native runtime on import, which does not exist under jsdom.
// Swap both for the jest mocks the packages ship so components that use
// useSharedValue / useAnimatedStyle render in tests without a native rebuild.
jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));
// The shipped reanimated mock leaves useReducedMotion out ("ADD ME IF NEEDED"),
// but Entrance.tsx (b16 F17) reads it synchronously, so provide it here. A file
// that needs a specific value overrides this mock locally (see Entrance.test).
jest.mock("react-native-reanimated", () => ({ ...require("react-native-reanimated/mock"), useReducedMotion: () => false }));
// ThemeProvider reads the saved palette via AsyncStorage.getItem().then(...).
// Without a mock the real async read resolves after the test finishes, leaking a
// setState across tests (React 19 "overlapping act()") and blanking the next
// render. The project's own tests use this same mock (see language.test.tsx).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
// lucide-react-native ships untranspiled ESM and its barrel re-exports ~1600
// icon files, so requiring it under jest transforms the whole set (slow) or
// fails on `export` syntax. Icons are decorative; stub every named icon with a
// component that renders nothing so components importing them mount in tests.
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));
// expo-audio patches AudioModule.AudioPlayer.prototype at *import* time
// (node_modules/expo-audio/src/ExpoAudio.ts:30). Under jest-expo there is no native
// AudioModule binding, so that top-level access throws
// "Cannot read properties of undefined (reading 'prototype')" and every suite that
// (transitively) imports it — journey/new.tsx via expo-audio, permissions.ts,
// siren.ts — fails to run. Provide a default module mock for the surface the app
// uses (AudioModule perms, createAudioPlayer, setAudioModeAsync). File-level
// jest.mock("expo-audio", …) in a suite (e.g. siren.test.ts) still overrides this.
jest.mock("expo-audio", () => ({
  AudioModule: {
    getRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  },
  createAudioPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), remove: jest.fn(), volume: 1 })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));
// BrandLockup reads AccessibilityInfo.isReduceMotionEnabled() and setState()s the
// result. Under jsdom the native query resolves outside any act() scope, and the
// looping float animation it would otherwise start keeps act() open across tests
// ("overlapping act()"). Report reduce-motion ON in tests: the lockup renders its
// static frame, no animation, and the promise resolves cleanly.
beforeEach(() => {
  const { AccessibilityInfo } = require("react-native");
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
});
