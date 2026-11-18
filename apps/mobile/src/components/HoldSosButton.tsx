import { useRef, useEffect } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Animated, { useSharedValue, useAnimatedProps, withTiming, cancelAnimation, Easing } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ShieldAlert } from "lucide-react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import i18n from "../i18n";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Hold-to-confirm SOS. The white progress ring is driven by a Reanimated shared
// value (withTiming over holdMs) — NOT by a JS setInterval + setState. Per-frame
// React state updates fired between the async act() boundaries of the fake-timer
// tests corrupt the act environment (overlapping act -> later renders blank);
// the shared value updates off the React tree, so tests stay pristine and the
// trigger still fires from a single setTimeout at holdMs.
export function HoldSosButton({ onTrigger, size = 72, holdMs = 1000, testID = "sos" }: { onTrigger: () => void; size?: number; holdMs?: number; testID?: string }) {
  const { d } = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(0);
  const r = size / 2 - 3, circ = 2 * Math.PI * r;
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - progress.value) }));
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    cancelAnimation(progress);
    progress.value = 0;
  };
  // Unmount mid-hold (role switch, sign-out, tree remount) must not let the
  // pending setTimeout fire onTrigger() plus heavy haptics on a dead component.
  useEffect(() => () => clear(), []);
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={i18n.t("sos.a11yHold")}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        progress.value = 0;
        progress.value = withTiming(1, { duration: holdMs, easing: Easing.linear });
        timer.current = setTimeout(() => {
          clear(); console.log("[sos] triggered");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          onTrigger();
        }, holdMs);
      }}
      onPressOut={() => { if (timer.current) { console.log("[sos] hold cancelled"); clear(); } }}
      style={{ width: size, height: size + 7, alignItems: "center" }}>
      <View style={{ position: "absolute", bottom: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: d.sosDeep }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: d.sos, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" }}>
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={d.onPrimary} strokeWidth={3} fill="none" strokeDasharray={circ} animatedProps={ringProps} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </Svg>
        <ShieldAlert size={size * 0.36} color={d.onPrimary} strokeWidth={2.2} />
        <Text variant="chip" color="onPrimary">SOS</Text>
      </View>
    </Pressable>
  );
}

export const SosButton = HoldSosButton;
