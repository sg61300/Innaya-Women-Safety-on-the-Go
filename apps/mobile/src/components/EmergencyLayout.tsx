import { useEffect, useState, type ReactNode } from "react";
import { View, Pressable, AccessibilityInfo, ScrollView } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
  cancelAnimation,
} from "react-native-reanimated";
import { ShieldAlert } from "lucide-react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { ActionLog, type ActionLogItem } from "./ActionLog";
import { useJourney } from "../store/journey";
import i18n from "../i18n";

// The two ends of the emergency/critical background pulse (fixed reds, palette
// independent — sos is #DC2626 in every palette per Global Constraints).
const PULSE_A = "#DC2626";
const PULSE_B = "#7F1D1D";

type EmergencyState = "EMERGENCY" | "CRITICAL" | "CANCEL_HOLD";

const mmss = (s: number) => {
  const t = Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

// Presentational EMERGENCY / CRITICAL layout (R37): a red pulsing screen with a
// shield, the state copy, the action log and one footer control. It owns NO
// timers or protocol state — Task 27/29 tick `elapsedS` and, in the *_HOLD
// states, pass the countdown/guardian sheet as `children`. The 0.9 s pulse is
// the only motion and it stops under reduce-motion.
export function EmergencyLayout({
  state,
  elapsedS,
  items,
  onCancelPress,
  children,
}: {
  state: EmergencyState;
  elapsedS: number;
  items: ActionLogItem[];
  onCancelPress: () => void;
  children?: ReactNode;
}) {
  const { d } = useTheme();
  const critical = state === "CRITICAL" || state === "CANCEL_HOLD";
  const [reduceMotion, setReduceMotion] = useState(false);
  const t = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => { if (alive) setReduceMotion(on); })
      .catch(() => {});
    // Keep in sync when the OS toggle changes while this screen is open.
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { alive = false; sub?.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion) { t.value = 0; return; }
    // 0.9 s each way between the two reds.
    t.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    return () => cancelAnimation(t);
  }, [reduceMotion]);

  const pulse = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [PULSE_A, PULSE_B]),
  }));

  const title = i18n.t(critical ? "emergency.titleCritical" : "emergency.titleEmergency");
  const line = critical
    ? i18n.t("emergency.lineCritical", { time: mmss(elapsedS) })
    : i18n.t("emergency.lineDefault", { time: mmss(elapsedS) });

  // F3 (b16): tell the founder whether the hidden camera is actually sending
  // frames. Fed from the frame-pipeline state (camRunning / camLastFrameAt in the
  // journey store, set by camera.ts). This layout re-renders every second via
  // elapsedS, so "last N s ago" stays fresh with no extra timer.
  const camRunning = useJourney((s) => s.camRunning);
  const camLastFrameAt = useJourney((s) => s.camLastFrameAt);
  const cameraLine = !camRunning
    ? i18n.t("emergency.cameraNotRunning")
    : camLastFrameAt != null
      ? i18n.t("emergency.cameraSending", { s: Math.max(0, Math.round((Date.now() - camLastFrameAt) / 1000)) })
      : i18n.t("emergency.cameraStarting");

  return (
    <View style={{ flex: 1, backgroundColor: PULSE_A }}>
      <Animated.View
        testID="emergency-pulse"
        style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, reduceMotion ? { backgroundColor: PULSE_A } : pulse]}
      />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 56,
          // Keep the note above Android's navigation area while allowing the
          // whole alarm screen to scroll on short devices.
          paddingBottom: 32,
          gap: 20,
        }}
        contentInsetAdjustmentBehavior="never"
      >
        <View style={{ alignItems: "center", gap: 12 }}>
          <ShieldAlert size={44} color={d.onPrimary} strokeWidth={2.2} />
          {/* H4: on a 320 dp phone the display heading grew to 3 lines and the
              last line clipped ("…ng ca"), pushing the checklist + cancel off
              screen. adjustsFontSizeToFit shrinks it to fit within 2 lines so the
              most safety-critical message stays fully readable on narrow screens. */}
          <Text
            variant="display"
            color="onPrimary"
            testID="emergency-title"
            numberOfLines={2}
            adjustsFontSizeToFit
            style={{ textAlign: "center" }}
          >
            {title}
          </Text>
          <Text variant="bodyStrong" color="onPrimary" style={{ textAlign: "center" }}>{line}</Text>
          <Text variant="caption" color="onPrimary" testID="emergency-camera-status" style={{ textAlign: "center", opacity: 0.85 }}>{cameraLine}</Text>
        </View>

        <View style={{ flex: 1, minHeight: 120 }}>
          <ActionLog items={items} tone="onCritical" />
        </View>

        {/* ADR-043: the slot (e.g. the 10 s siren countdown) sits ABOVE the button;
            the "Not an emergency" control stays available under the siren/hold. */}
        {children ? <View testID="emergency-hold-slot">{children}</View> : null}
        <Pressable
          testID="emergency-cancel"
          accessibilityRole="button"
          accessibilityLabel={i18n.t(critical ? "emergency.cancelCritical" : "emergency.cancelEmergency")}
          onPress={onCancelPress}
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            // CRITICAL: ghost-on-red (outlined). EMERGENCY: solid white face.
            backgroundColor: critical ? "transparent" : d.onPrimary,
            borderWidth: critical ? 1.5 : 0,
            borderColor: "rgba(255,255,255,0.85)",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text variant="bodyStrong" color={critical ? "onPrimary" : PULSE_A}>
            {i18n.t(critical ? "emergency.cancelCritical" : "emergency.cancelEmergency")}
          </Text>
        </Pressable>

        <Text variant="caption" color="onPrimary" style={{ textAlign: "center", opacity: 0.9 }}>
          {i18n.t("emergency.note")}
        </Text>
      </ScrollView>
    </View>
  );
}
