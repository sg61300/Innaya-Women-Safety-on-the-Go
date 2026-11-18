import "../src/i18n";
import "../src/services/location";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "../src/theme";
import { useAppFonts } from "../src/theme/typography";
import { SplashVideo } from "../src/components/SplashVideo";
import { resolveSplash, type SplashDecision } from "../src/lib/splashGate";
import { startSafetyMarker } from "../src/services/safetyMarker";
import { TourProvider } from "../src/components/tour/TourProvider";
import { TourOverlay } from "../src/components/tour/TourOverlay";

// Keep the native splash (expo-splash-screen, #0C0A1E) up until the JS tree is
// ready, so the hand-off to <SplashVideo> has no white flash.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Founder 2026-10-13: "Short dissolve (~150-200 ms)" when the native start screen
// hands over to the video's first frame.
SplashScreen.setOptions({ fade: true, duration: 180 });

// Root navigator + brand splash overlay + tour overlay. The routing decision
// lives in app/index.tsx (the `/` route). i18n is imported first so t() is
// initialised before any screen renders. Wrapper order (Amendment 16):
// ThemeProvider -> TourProvider -> fonts gate -> splash overlay -> routing.
function Root() {
  // Hold the tree until the app fonts are registered so no screen renders with a
  // fallback face; the native splash stays visible during that gap.
  const fontsLoaded = useAppFonts();
  const [splashDone, setSplashDone] = useState(false);
  const [reduce, setReduce] = useState(false);
  // s32: whether to show the video splash + Continue is decided at launch
  // (first-launch vs later-open, and the no-splash cases: opened from a
  // notification / journey or SOS active). null = not resolved yet.
  const [decision, setDecision] = useState<SplashDecision | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
  }, []);

  useEffect(() => {
    // Observe journey/SOS state so the persisted "safety active" marker is kept
    // current for the next launch's splash gate (see safetyMarker.ts).
    const unsub = startSafetyMarker();
    // Resolve the splash gate (fast: a notification read + <=2 AsyncStorage
    // reads), in parallel with font loading.
    resolveSplash().then(setDecision).catch(() => setDecision({ show: false, showContinue: false }));
    // Warm-start safety: if the user taps an INNAYA notification while the
    // splash is still showing, dismiss it immediately so nothing is hidden.
    const sub = Notifications.addNotificationResponseReceivedListener(() => setSplashDone(true));
    return () => {
      try { unsub(); } catch { /* noop */ }
      sub?.remove?.();
    };
  }, []);

  // Hide the native splash exactly once.
  const hideNativeRef = useRef(false);
  const hideNative = () => {
    if (hideNativeRef.current) return;
    hideNativeRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };

  useEffect(() => {
    if (!(fontsLoaded && decision)) return;
    // No overlay to show -> hide the native splash now.
    if (!decision.show) {
      hideNative();
      return;
    }
    // Overlay WILL show: keep the native splash up until the video's first frame
    // has rendered (SplashVideo.onReady -> hideNative), so the native emblem and
    // the video's first frame never overlap during the hand-over. Fallback so a
    // stuck or erroring video can never trap the native splash.
    const fb = setTimeout(hideNative, 2500);
    return () => clearTimeout(fb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsLoaded, decision]);

  // Hold the native splash until BOTH fonts and the splash decision are ready,
  // so the app never flashes a bare screen before the overlay (or no overlay).
  if (!fontsLoaded || !decision) return null;

  return (
    <>
      {/* Founder ruling 2026-10-09: deep-plum dark app -> light status bar icons. */}
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(setup)" />
        <Stack.Screen name="(user)" />
        <Stack.Screen name="(guardian)" />
      </Stack>
      <TourOverlay />
      {decision.show && !splashDone && (
        <SplashVideo
          onDone={() => setSplashDone(true)}
          onReady={hideNative}
          showContinue={decision.showContinue}
          reduceMotion={reduce}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <TourProvider>
          <Root />
        </TourProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
