import { useEffect } from "react";
import { View } from "react-native";
import { MapPin } from "lucide-react-native";
import { Canvas, Fill, LinearGradient, vec } from "@shopify/react-native-skia";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation, Easing } from "react-native-reanimated";
import { useTheme } from "../theme";
import { Text } from "./Text";
import i18n from "../i18n";

// Same hue at reduced alpha for the second band of the diagonal stripes. Falls
// back to the colour itself for non-#RRGGBB input.
function alpha(hex: string, a: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${a}` : hex;
}

// Founder 2026-10-12 (option B, exactly as read from the preview): a dashed route
// line from a start dot (left) to a destination pin (right); a done segment in the
// current safety-state colour grows left→right; a moving dot (state-colour ring)
// rides the done edge but STOPS SHORT of the pin. Below: the start time and the
// am/pm expected-arrival time. Past the expected time it does NOT sit at 100% —
// it shows "Running late, N min" (in amber). The bar stays visible on Emergency
// (the caller keeps rendering it). With reduce-motion the dot is STILL (no ping).
//
// The done segment is a plain RN view in the safety-state colour; when overdue it
// shows REAL amber diagonal stripes drawn with @shopify/react-native-skia (already
// a dependency) — a repeating diagonal linear gradient with hard colour stops. The
// stripes are a STATIC Skia fill (drawn once, no per-frame work) and only exist
// while late. The only animated part is the moving-dot ping, which is Reanimated
// and stops under reduce-motion.
export function RouteProgress({ fraction, startLabel, endLabel, late, lateMinutes, stateColor, reduceMotion = false }: {
  fraction: number; // 0..1, already clamped by the caller
  startLabel: string; // e.g. "9:15 AM"
  endLabel: string; // expected arrival, e.g. "9:40 AM"
  late: boolean;
  lateMinutes: number;
  stateColor: string;
  reduceMotion?: boolean;
}) {
  const { p, d } = useTheme();
  const frac = Math.max(0, Math.min(1, fraction));
  const amber = d.chip.amber.fg;
  const ping = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) { cancelAnimation(ping); ping.value = 0; return; }
    ping.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
    return () => { cancelAnimation(ping); };
  }, [reduceMotion, ping]);

  const pingStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - ping.value),
    transform: [{ scale: 1 + ping.value * 1.8 }],
  }));

  // done grows to ~92% of the track (the dot never reaches the pin at the far right).
  const donePct: `${number}%` = `${frac * 92}%`;
  const dotPct: `${number}%` = `${frac * 86}%`;

  return (
    <View testID="route-progress">
      <View style={{ height: 24, justifyContent: "center" }}>
        {/* dashed route line */}
        <View style={{ position: "absolute", left: 7, right: 22, top: 11, height: 0, borderTopWidth: 2, borderStyle: "dashed", borderColor: p.textFaint, opacity: 0.6 }} />
        {/* done segment: state colour normally; REAL amber diagonal stripes when late */}
        <View style={{ position: "absolute", left: 7, top: 9, height: 6, borderRadius: 3, width: donePct, overflow: "hidden", backgroundColor: late ? "transparent" : stateColor }}>
          {late ? (
            <Canvas style={{ flex: 1 }}>
              <Fill>
                <LinearGradient start={vec(0, 0)} end={vec(9, 9)} colors={[amber, amber, alpha(amber, "55"), alpha(amber, "55")]} positions={[0, 0.5, 0.5, 1]} mode="repeat" />
              </Fill>
            </Canvas>
          ) : null}
        </View>
        {/* start dot (rose ring) */}
        <View style={{ position: "absolute", left: 0, top: 6, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: p.rose, backgroundColor: p.bgBase }} />
        {/* moving dot: state-colour ring, stops short of the pin */}
        <View style={{ position: "absolute", top: 4, left: dotPct }}>
          {!reduceMotion ? (
            <Animated.View pointerEvents="none" style={[{ position: "absolute", width: 16, height: 16, borderRadius: 8, backgroundColor: stateColor }, pingStyle]} />
          ) : null}
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: p.bgCard2, borderWidth: 3, borderColor: stateColor }} />
        </View>
        {/* destination pin */}
        <View style={{ position: "absolute", right: 0, top: 2 }}>
          <MapPin size={18} color={p.rose} strokeWidth={2.2} />
        </View>
      </View>
      {/* labels: start time + expected arrival (am/pm); "Running late" takes over when overdue */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}>
        <Text variant="caption" color="faint">{startLabel}</Text>
        {late ? (
          <Text variant="caption" color={d.chip.amber.fg} testID="route-late">{i18n.t("home.runningLate", { n: lateMinutes })}</Text>
        ) : (
          <Text variant="caption" color="faint">{endLabel}</Text>
        )}
      </View>
    </View>
  );
}
