import { useEffect, useState } from "react";
import { Image, View, AccessibilityInfo } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from "react-native-reanimated";

// VAIRA lockup (Design/02 §4.2): ~190 dp wide, floats ±5 dp over 3 s. The float
// is disabled when the OS "reduce motion" setting is on (Global Constraints);
// then the lockup sits static.
export function BrandLockup({ width = 190 }: { width?: number }) {
  const y = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (alive) setReduceMotion(on); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion) { y.value = 0; return; }
    y.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(5, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [reduceMotion]);

  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View style={anim}>
        <Image
          accessibilityRole="image"
          accessibilityLabel="VAIRA"
          source={require("../../assets/brand/lockup.png")}
          style={{ width, height: width * 0.5, resizeMode: "contain" }}
        />
      </Animated.View>
    </View>
  );
}
