import { useEffect, useRef } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Canvas, Rect, LinearGradient, vec } from "@shopify/react-native-skia";
import i18n from "../i18n";
import { splashVideoTiming } from "../lib/splashVideoTiming";

// INNAYA video splash (s32/s33). Founder decisions:
//  - Plays the approved 5 s walking-logo video ONCE, then hands off (onDone).
//  - "INNAYA" + the tagline sit BELOW the video; tagline on ONE line.
//  - Background == dark plum #17111F ("App bg = video bg"). The clip now carries
//    explicit bt709/tv colour tags so the decoder keeps the dark ground, and a
//    Skia edge-fade (below) paints exact #17111F over the outer few % of the
//    square so no box edge can show even if a device still differs.
//  - First launch after install: no Continue button. Later opens: Continue;
//    if not tapped the splash still auto-advances when the video ends.
//  - onReady fires on the video's FIRST rendered frame (or at once in reduce
//    motion) so the caller can hide the native splash only then — no two-emblem
//    overlap during the hand-over.
// WHEN the splash is shown (first-launch vs later-open, and the no-splash cases)
// is decided by the caller (splashGate), never here.
const SOURCE = require("../../assets/video/innaya-walk.mp4");
const BG = "#17111F"; // dark plum (founder: keep #17111F)
const BG_T = "#17111F00"; // same colour, zero alpha (fade target — no colour shift)
const CREAM = "#F4EEF8";
const FEATHER_PCT = 0.08; // PLACEHOLDER: outer % of the square faded into BG
const GUTTER = 16; // side gutter used to size the one-line tagline

export function SplashVideo({
  onDone,
  onReady,
  showContinue = false,
  reduceMotion = false,
}: {
  onDone: () => void;
  // Fires when the first video frame has rendered (or immediately in reduce
  // motion). The caller hides the native splash here for a clean hand-over.
  onReady?: () => void;
  showContinue?: boolean;
  reduceMotion?: boolean;
}) {
  const t = splashVideoTiming();
  const { width, height } = useWindowDimensions();

  const player = useVideoPlayer(SOURCE, (p) => {
    p.loop = false;
    p.muted = true; // no surprise sound on launch (OPEN: audio?)
    if (!reduceMotion) p.play();
  });

  // Fire onDone exactly once (video end, fallback, or Continue tap).
  const firedRef = useRef(false);
  const fire = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onDone();
  };
  // Fire onReady exactly once.
  const readyRef = useRef(false);
  const ready = () => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReady?.();
  };

  useEffect(() => {
    if (reduceMotion) {
      ready(); // no video to wait for — let the native splash hide at once
      const id = setTimeout(fire, t.reducedDoneMs);
      return () => clearTimeout(id);
    }
    const sub = player.addListener("playToEnd", fire);
    const fallback = setTimeout(fire, t.doneFallbackMs);
    return () => {
      sub.remove();
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centred square; contentFit="contain" keeps the 640x640 clip un-cropped.
  // PLACEHOLDER sizing/margins ("we will discuss").
  const square = Math.min(width * 0.86, height * 0.5);
  const feather = Math.round(square * FEATHER_PCT);

  // One-line tagline: size computed from the available width (no wrapping),
  // clamped to a readable minimum. numberOfLines={1} + adjustsFontSizeToFit are
  // belt-and-suspenders so it can never wrap. Sizes at 360/390/412 dp ~= 12.6 /
  // 13.8 / 14.6 (see s33 report).
  const taglineSize = Math.max(11, Math.min(16, (width - GUTTER * 2) / 26));

  return (
    <View
      testID="splash-video"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BG, alignItems: "center", justifyContent: "center" }}
    >
      {!reduceMotion && (
        <View style={{ width: square, height: square }}>
          <VideoView
            player={player}
            style={{ width: square, height: square, backgroundColor: BG }}
            contentFit="contain"
            nativeControls={false}
            pointerEvents="none"
            onFirstFrameRender={ready}
          />
          {/* Skia edge-fade: paint exact #17111F over the outer few % of the
              square, fading inward, so no box edge shows even if the decoder
              still lifts the ground slightly. Drawn in-app, NOT baked in. */}
          <Canvas style={{ position: "absolute", left: 0, top: 0, width: square, height: square }} pointerEvents="none">
            <Rect x={0} y={0} width={square} height={feather}>
              <LinearGradient start={vec(0, 0)} end={vec(0, feather)} colors={[BG, BG_T]} />
            </Rect>
            <Rect x={0} y={square - feather} width={square} height={feather}>
              <LinearGradient start={vec(0, square)} end={vec(0, square - feather)} colors={[BG, BG_T]} />
            </Rect>
            <Rect x={0} y={0} width={feather} height={square}>
              <LinearGradient start={vec(0, 0)} end={vec(feather, 0)} colors={[BG, BG_T]} />
            </Rect>
            <Rect x={square - feather} y={0} width={feather} height={square}>
              <LinearGradient start={vec(square, 0)} end={vec(square - feather, 0)} colors={[BG, BG_T]} />
            </Rect>
          </Canvas>
        </View>
      )}

      {/* INNAYA + one-line tagline BELOW the video. */}
      <View style={{ marginTop: height * 0.03, width, paddingHorizontal: GUTTER }}>
        <Text
          testID="splash-wordmark"
          accessibilityLabel="INNAYA"
          style={{ color: CREAM, fontFamily: "Spectral_600SemiBold", fontSize: Math.min(width, height) * 0.09, letterSpacing: Math.min(width, height) * 0.03, textAlign: "center" }}
        >
          INNAYA
        </Text>
        <Text
          testID="splash-tagline"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ color: CREAM, opacity: 0.86, fontFamily: "WorkSans_400Regular", fontSize: taglineSize, letterSpacing: 0, textAlign: "center", marginTop: Math.min(width, height) * 0.02 }}
        >
          The companion who cares, every step of the way
        </Text>
      </View>

      {/* Continue button — founder: solid rose-gold pill (#C6997A, pressed
          #B4886B), dark text. OPEN: the WORD is a placeholder (i18n key
          splash.continue = English "Continue" in en/hi/kn). */}
      {showContinue && !reduceMotion && (
        <Pressable
          testID="splash-continue"
          accessibilityRole="button"
          accessibilityLabel={i18n.t("splash.continue")}
          onPress={fire}
          style={({ pressed }) => ({
            position: "absolute",
            bottom: height * 0.08,
            paddingVertical: 14,
            paddingHorizontal: 44,
            borderRadius: 999,
            backgroundColor: pressed ? "#B4886B" : "#C6997A",
          })}
        >
          <Text style={{ color: "#17111F", fontFamily: "WorkSans_600SemiBold", fontSize: Math.min(width, height) * 0.042, letterSpacing: 0.5 }}>
            {i18n.t("splash.continue")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
