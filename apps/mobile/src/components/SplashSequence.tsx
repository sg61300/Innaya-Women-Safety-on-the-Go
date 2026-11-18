import { useContext, useEffect, useState } from "react";
import { View, Image } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { splashTimeline } from "../lib/splashTiming";

// Five-frame brand crossfade + lockup. Full-screen overlay on #0C0A1E (matches
// the native splash colour so there is no white flash on cold start). With
// `reduceMotion` the animation is skipped: the final frame + lockup render at
// once and onDone fires after 1200 ms. Colours here are the fixed brand splash
// palette (not theme tokens) — the splash paints before the theme is chosen.
const FRAMES = [
  require("../../assets/brand/splash-00.png"),
  require("../../assets/brand/splash-01.png"),
  require("../../assets/brand/splash-02.png"),
  require("../../assets/brand/splash-03.png"),
  require("../../assets/brand/splash-04.png"),
];
// Option 1 (founder, s12): the frames are emblem-only crops and the second beat is the
// wordmark + tagline crop (wordmark.png, 905×280). lockup.png stays the full brand image for the login screen.
const LOCKUP = require("../../assets/brand/wordmark.png");

export function SplashSequence({ onDone, reduceMotion = false }: { onDone: () => void; reduceMotion?: boolean }) {
  const t = splashTimeline();
  // F18: keep the page dots above the device gesture bar / bottom inset. Read the
  // inset via context (null with no SafeAreaProvider, e.g. under jest) so it never
  // throws; fall back to a safe minimum.
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const [frame, setFrame] = useState(reduceMotion ? FRAMES.length - 1 : 0);
  const [lockup, setLockup] = useState(reduceMotion);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (reduceMotion) {
      timers.push(setTimeout(onDone, 1200));
    } else {
      t.frameAt.forEach((ms, i) => timers.push(setTimeout(() => setFrame(i), ms)));
      timers.push(setTimeout(() => setLockup(true), t.lockupAt));
      timers.push(setTimeout(onDone, t.doneAt));
    }
    console.log("[splash] start", { reduceMotion });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ position: "absolute", inset: 0, backgroundColor: "#0C0A1E", alignItems: "center", justifyContent: "center" }} testID="splash">
      <View style={{ position: "absolute", width: 420, height: 420, borderRadius: 210, backgroundColor: "rgba(168,85,247,0.22)", top: "18%" }} />
      <View style={{ position: "absolute", width: 300, height: 300, borderRadius: 150, backgroundColor: "rgba(236,72,153,0.12)", top: "26%" }} />
      <View style={{ width: 200, height: 200 }}>
        {FRAMES.map((src, i) => (
          <Image key={i} source={src} testID={`splash-frame-${i}`} style={{ position: "absolute", width: 200, height: 200, resizeMode: "contain", opacity: i === frame ? 1 : 0 }} />
        ))}
      </View>
      <Image source={LOCKUP} style={{ width: 200, height: 62, resizeMode: "contain", marginTop: 18, opacity: lockup ? 1 : 0 }} accessibilityLabel="VAIRA — Move freely. We've got you." />
      <View style={{ position: "absolute", bottom: Math.max(28, bottomInset + 16), flexDirection: "row", gap: 6 }}>
        {FRAMES.map((_, i) => (
          <View key={i} style={{ width: i === frame ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i <= frame ? "#F472B6" : "rgba(244,114,182,0.2)" }} />
        ))}
      </View>
    </View>
  );
}
