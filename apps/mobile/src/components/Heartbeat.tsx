import { useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, cancelAnimation, Easing } from "react-native-reanimated";
import { useMotionActive } from "../lib/useMotionActive";
import { MOTION } from "../lib/motion";

// Founder 2026-10-12: the vitals icon beats "like a heartbeat" — a quick double
// beat (lub-dub) then a rest, repeating. Library-free (Reanimated only) so the
// screens that render it stay green in jest. Gated by useMotionActive: STILL when
// the OS "reduce motion" setting is on, and paused when the screen is not focused
// (off-screen / backgrounded), mirroring MotionIllustration. All amounts/speeds
// come from MOTION.heartbeat (one source; founder-tunable).
export function Heartbeat({ children, style, testID }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const active = useMotionActive();
  const s = useSharedValue(1); // scale driver, rests at 1

  useEffect(() => {
    if (!active) { cancelAnimation(s); s.value = 1; return; }
    const { beatScale, beatUpMs, beatDownMs, gapMs, restMs } = MOTION.heartbeat;
    const up = withTiming(beatScale, { duration: beatUpMs, easing: Easing.out(Easing.quad) });
    const down = withTiming(1, { duration: beatDownMs, easing: Easing.in(Easing.quad) });
    // lub  →  short gap  →  dub  →  long rest, then repeat.
    s.value = withRepeat(
      withSequence(
        up,
        down,
        withTiming(1, { duration: gapMs }),
        up,
        down,
        withTiming(1, { duration: restMs }),
      ),
      -1,
      false,
    );
    return () => { cancelAnimation(s); };
  }, [active, s]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Animated.View testID={testID} style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
}
