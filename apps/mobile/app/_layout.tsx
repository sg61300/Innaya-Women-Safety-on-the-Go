import "../src/i18n";
import "../src/services/location";
import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { ThemeProvider } from "../src/theme";
import { useAppFonts } from "../src/theme/typography";
import { SplashSequence } from "../src/components/SplashSequence";
import { TourProvider } from "../src/components/tour/TourProvider";
import { TourOverlay } from "../src/components/tour/TourOverlay";

// Keep the native splash (expo-splash-screen, #0C0A1E) up until the JS tree is
// ready, so the hand-off to <SplashSequence> has no white flash.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
  }, []);
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(setup)" />
        <Stack.Screen name="(user)" />
        <Stack.Screen name="(guardian)" />
      </Stack>
      <TourOverlay />
      {!splashDone && <SplashSequence onDone={() => setSplashDone(true)} reduceMotion={reduce} />}
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
