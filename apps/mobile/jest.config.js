module.exports = {
  preset: "jest-expo",
  // jest-expo cold-renders a suite's first RN component synchronously in the test
  // body (module init + transform). The default 5000ms per-test budget is too
  // small for that: language.test.tsx has been seen spending ~15.9s in a cold
  // render and tripping the 5s timeout in the full batch (green in isolation,
  // where the render is warm). 30s covers the worst observed cold render with
  // margin while still catching genuine hangs. Not a product bug.
  testTimeout: 30000,
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  roots: ["<rootDir>/src"],
  // node_modules is flat (pnpm node-linker=hoisted). Use the standard jest-expo
  // transform allow-list, extended with the workspace (@vaira) and @supabase
  // packages that ship untranspiled ESM/TS. `standard-navigation` is expo-router's
  // ESM-only dep, transformed so the F16 nav-state test can load the real router.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@sentry/react-native|native-base|react-native-svg|@supabase/.*|@vaira/.*)",
  ],
};
