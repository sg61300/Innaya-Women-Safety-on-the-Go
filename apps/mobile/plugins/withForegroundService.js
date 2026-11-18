// R35 / Task 24 amendment (s06, founder): the journey foreground service must
// keep running when the app is backgrounded, the screen is off, or the task is
// swiped away from recents. Android keeps a started foreground service alive
// across a task swipe only when the service declares android:stopWithTask="false".
// Android 14+ also requires the microphone foregroundServiceType so the Task 25
// listener may hold the mic open while the service runs. expo-location declares
// its service (LocationTaskService) with foregroundServiceType="location" only
// and no stopWithTask, so this config plugin patches those two attributes onto
// the same service node in the merged AndroidManifest. Any manifest change is
// only observable in the CI-built APK (R31) — jest cannot verify it.
const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

const SERVICE_NAME = "expo.modules.location.services.LocationTaskService";

const withForegroundService = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    // Our attributes must override the expo-location library manifest at merge
    // time, which needs the tools namespace declared on <manifest>.
    manifest.manifest.$ = manifest.manifest.$ ?? {};
    manifest.manifest.$["xmlns:tools"] =
      manifest.manifest.$["xmlns:tools"] ?? "http://schemas.android.com/tools";

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = app.service ?? [];
    let svc = app.service.find((s) => s.$ && s.$["android:name"] === SERVICE_NAME);
    if (!svc) {
      svc = { $: { "android:name": SERVICE_NAME } };
      app.service.push(svc);
    }
    svc.$["android:exported"] = "false";
    svc.$["android:stopWithTask"] = "false";
    svc.$["android:foregroundServiceType"] = "location|microphone";
    svc.$["tools:replace"] = "android:foregroundServiceType,android:stopWithTask,android:exported";
    return cfg;
  });

module.exports = withForegroundService;
