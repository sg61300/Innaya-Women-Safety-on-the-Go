// Fix lane D6 (founder Q128): photos saved on the phone while offline
// (documentDirectory frame-queue/) must not go into Android backup or device transfer.
// Fact found by the lane: expo-secure-store's plugin already sets the app's backup rules,
// and those rules INCLUDE only the "sharedpref" domain. Android then backs up nothing
// else, so the "file" domain (documentDirectory, where frame-queue/ lives) is left out
// of cloud backup and device transfer. No new config is needed; this guards it.
const fs = require("fs");
const path = require("path");

const loadConfig = () => {
  let config: any;
  jest.isolateModules(() => { config = require("../../app.config").default; });
  return config;
};
const secureStoreDir = path.dirname((require as any).resolve("expo-secure-store/package.json"));
const xml = (f: string) => fs.readFileSync(path.join(secureStoreDir, "android/src/main/res/xml", f), "utf8");
const includes = (s: string) => [...s.matchAll(/<include\s+domain="([^"]+)"/g)].map((m) => m[1]);

test("expo-secure-store is a plugin and still owns the Android backup rules", () => {
  const plugins: any[] = loadConfig().plugins;
  const entry = plugins.find((p) => (Array.isArray(p) ? p[0] : p) === "expo-secure-store");
  expect(entry).toBeDefined();
  expect(Array.isArray(entry) ? entry[1]?.configureAndroidBackup : undefined).not.toBe(false);
  // No other plugin or config sets backup rules that would replace them.
  expect(JSON.stringify(loadConfig())).not.toMatch(/fullBackupContent|dataExtractionRules|allowBackup/);
});

test("the backup rules include only sharedpref, so frame-queue/ in the file domain is not backed up", () => {
  const legacy = xml("secure_store_backup_rules.xml"); // Android 11 and lower
  const modern = xml("secure_store_data_extraction_rules.xml"); // Android 12+
  expect(includes(legacy)).toEqual(["sharedpref"]);
  expect(modern).toContain("<cloud-backup>");
  expect(modern).toContain("<device-transfer>");
  expect(includes(modern)).toEqual(["sharedpref", "sharedpref"]); // cloud backup, device transfer
});

test("the saved-photo folder is under documentDirectory (the file domain)", () => {
  const src = fs.readFileSync((require as any).resolve("../services/frameQueue"), "utf8");
  expect(src).toContain("`${FileSystem.documentDirectory}frame-queue/`");
});
