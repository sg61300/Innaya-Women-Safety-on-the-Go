import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation, Easing } from "react-native-reanimated";
import { Canvas, Image as SkImage, useAnimatedImageValue } from "@shopify/react-native-skia";
import { Illustration } from "./Illustration";
import { MOTION } from "../lib/motion";

const TWO_PI = Math.PI * 2;

// P10 go-live: the approved pre-rendered 3D phone turn (25° each way, 72 frames
// @24 fps) played straight from its animated webp by Skia's useAnimatedImageValue,
// which advances frames at the file's own rate and loops. `active=false` pauses it
// on the current frame (still), covering reduce-motion and the off-screen case.
export function GoLiveTurn({ size = MOTION.goLive.boxPx, active }: { size?: number; active: boolean }) {
  const paused = useSharedValue(!active);
  useEffect(() => { paused.value = !active; }, [active, paused]);
  const img = useAnimatedImageValue(require("../../assets/illustrations/simulate-golive-turn.webp"), paused);
  return (
    <Canvas style={{ width: size, height: size }} testID="golive-turn">
      <SkImage image={img} x={0} y={0} width={size} height={size} fit="contain" />
    </Canvas>
  );
}

// P11 video-check: the two phone halves drift in OPPOSITE vertical directions and
// the Live charm between them tilts so its lens faces whichever phone is higher
// (founder example: right phone up, left down → camera tilts toward the top phone).
// One linear 0..1 driver `w`; sin(2πw) gives the smooth opposite drift and tilt.
export function VideoCheckLink({ size = 64, active }: { size?: number; active: boolean }) {
  const w = useSharedValue(0);
  useEffect(() => {
    if (!active) { cancelAnimation(w); w.value = 0; return; }
    w.value = withRepeat(withTiming(1, { duration: MOTION.videoCheck.periodMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(w);
  }, [active, w]);

  const A = MOTION.videoCheck.driftPx;
  const tilt = MOTION.videoCheck.cameraTiltDeg;
  // right phone up when sin>0; left phone is the opposite.
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -A * Math.sin(TWO_PI * w.value) }] }));
  const leftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: A * Math.sin(TWO_PI * w.value) }] }));
  const camStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt * Math.sin(TWO_PI * w.value)}deg` }] }));

  const phone = size * 0.62;
  const cam = size * 0.42;
  return (
    <View style={{ height: size, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 }} testID="videocheck-link">
      <Animated.View style={leftStyle}><Illustration name="simulate-videocall-left" size={phone} /></Animated.View>
      <Animated.View style={camStyle}><Illustration name="tab-live" size={cam} /></Animated.View>
      <Animated.View style={rightStyle}><Illustration name="simulate-videocall-right" size={phone} /></Animated.View>
    </View>
  );
}
