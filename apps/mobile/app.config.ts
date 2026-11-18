import { ExpoConfig } from "expo/config";

// Migrated from app.json so the Google Maps Android key can come from the
// environment instead of being committed. Expo loads apps/mobile/.env for
// app.config, and CI passes the secret (see .github/workflows/android-debug.yml).
// Nothing else changed from the former app.json.
const config = {
  name: "VAIRA",
  slug: "vaira",
  version: "1.0.0",
  scheme: "vaira",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  owner: process.env.EXPO_OWNER ?? "your-expo-username",
  extra: { eas: { projectId: process.env.EAS_PROJECT_ID ?? "00000000-0000-0000-0000-000000000000" } },
  updates: { url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID ?? "00000000-0000-0000-0000-000000000000"}` },
  runtimeVersion: { policy: "appVersion" },
  icon: "./assets/brand/icon-1024.png",
  splash: {
    image: "./assets/brand/emblem.png",
    resizeMode: "contain",
    backgroundColor: "#0C0A1E",
  },
  notification: {
    icon: "./assets/brand/notification.png",
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    package: "com.vaira.app",
    // T5: all traffic is HTTPS (Supabase, Expo, api). Pin cleartext off explicitly
    // so a release AAB never allows plaintext HTTP even if a target-SDK default shifts.
    usesCleartextTraffic: false,
    adaptiveIcon: {
      foregroundImage: "./assets/brand/adaptive-fg.png",
      backgroundImage: "./assets/brand/adaptive-bg.png",
    },
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
      "FOREGROUND_SERVICE_MICROPHONE",
      "FOREGROUND_SERVICE_CAMERA",
      "RECORD_AUDIO",
      "CAMERA",
      "POST_NOTIFICATIONS",
      "WAKE_LOCK",
      "MODIFY_AUDIO_SETTINGS",
      "ACCESS_NOTIFICATION_POLICY",
      "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
    ],
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_KEY ?? "",
      },
    },
  },
  plugins: [
    // APK size (lane Z): R8/ProGuard + resource shrink strip unused Java/Kotlin
    // and resources from the release build; useLegacyPackaging: true DEFLATE-
    // compresses the native .so in the standalone APK (they ship Stored/0% today,
    // so this is the single biggest download-size win). extraProguardRules keep
    // every class that Skia, ML Kit, Vosk/JNA, Reanimated/Worklets, expo-modules,
    // react-native-maps and Hermes reach through JNI/reflection, which R8 cannot
    // see. REQUIRES: `cd apps/mobile && npx expo install expo-build-properties`
    // before the next build (not yet in node_modules; lane may not run install).
    [
      "expo-build-properties",
      {
        android: {
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          useLegacyPackaging: true,
          extraProguardRules: [
            "# Skia (JNI)",
            "-keep class com.shopify.reactnative.skia.** { *; }",
            "-dontwarn com.shopify.reactnative.skia.**",
            "# ML Kit face detection + text recognition (reflection + GMS internals)",
            "-keep class com.google.mlkit.** { *; }",
            "-keep class com.google.android.gms.internal.mlkit_** { *; }",
            "-keep class com.google.android.gms.vision.** { *; }",
            "-dontwarn com.google.mlkit.**",
            "# Vosk offline speech + JNA (heavy reflection, native-backed)",
            "-keep class org.vosk.** { *; }",
            "-keep class com.sun.jna.** { *; }",
            "-keepclassmembers class * extends com.sun.jna.** { *; }",
            "-dontwarn com.sun.jna.**",
            "-dontwarn java.awt.**",
            "# Reanimated 4 + Worklets (JNI-called)",
            "-keep class com.swmansion.reanimated.** { *; }",
            "-keep class com.swmansion.worklets.** { *; }",
            "-keep class com.facebook.react.turbomodule.** { *; }",
            "# Expo modules (reflection-based module registration)",
            "-keep class expo.modules.** { *; }",
            "-keep class * implements expo.modules.core.interfaces.Package { *; }",
            "# react-native-maps + Google Maps",
            "-keep class com.rnmaps.maps.** { *; }",
            "-keep class com.google.android.gms.maps.** { *; }",
            "-dontwarn com.google.android.gms.maps.**",
            "# Hermes + JNI bridge",
            "-keep class com.facebook.hermes.** { *; }",
            "-keep class com.facebook.jni.** { *; }",
          ].join("\n"),
        },
      },
    ],
    "expo-router",
    "expo-localization",
    [
      "expo-location",
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    // R35: patches stopWithTask=false + foregroundServiceType="location|microphone"
    // onto the expo-location foreground service so the journey survives a recents
    // swipe and can hold the mic for the Task 25 listener (verified via CI APK).
    "./plugins/withForegroundService",
    // R43: bundle siren.mp3 so the vaira-alarm loud-override channel can use it.
    ["expo-notifications", { sounds: ["./assets/siren.mp3"] }],
    "expo-camera",
    "expo-secure-store",
    [
      "expo-speech-recognition",
      {
        microphonePermission: "VAIRA listens for your safety words during a journey.",
        speechRecognitionPermission:
          "VAIRA turns speech into text on your phone to detect your safety words.",
        // X6 (s25): do NOT rely only on the Google app — on Samsung it can be
        // disabled/absent, which left the mic dead. List the common on-device
        // recognition services so the app can discover whichever the phone has
        // (Android 11+ package visibility); the runtime still uses the device
        // DEFAULT service (stt.ts does not pin androidRecognitionServicePackage).
        androidSpeechServicePackages: [
          "com.google.android.googlequicksearchbox",
          "com.google.android.tts",
          "com.samsung.android.bixby.agent",
          "com.samsung.android.svoiceime",
        ],
      },
    ],
  ],
};

export default config as ExpoConfig;
