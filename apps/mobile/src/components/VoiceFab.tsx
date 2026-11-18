import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "../theme";

// D7: single source of truth for the bottom clearance a FAB-bearing screen must
// reserve so the floating mic FAB (positioned at bottom:96, 52dp tall) never
// overlaps the last card / CTA. Home applies it as scroll paddingBottom and
// (setup)/profile as a trailing spacer — one constant, no drift.
export const FAB_INSET = 72;

// JS-only mic glyph (no vector-icon native module): capsule + arc stand + base.
function MicGlyph({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 8, height: 13, borderRadius: 4, backgroundColor: color }} />
      <View style={{ width: 14, height: 7, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderColor: color, borderWidth: 1.6, borderTopWidth: 0, marginTop: -3 }} />
      <View style={{ width: 1.6, height: 3, backgroundColor: color }} />
      <View style={{ width: 9, height: 1.6, backgroundColor: color }} />
    </View>
  );
}

function Bar({ delay }: { delay: number }) {
  const h = useSharedValue(4);
  // Start the pulse in an effect, not during render — writing a shared value
  // while React renders triggers a Reanimated warning.
  useEffect(() => { h.value = withRepeat(withTiming(16, { duration: 350 }), -1, true); }, [h, delay]);
  const s = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[{ width: 3, borderRadius: 2, backgroundColor: "#fff", marginHorizontal: 1.5 }, s]} />;
}

export function VoiceFab({ listening, onToggle, denied, disabled, accessibilityLabel }: { listening: boolean; onToggle: () => void; denied?: boolean; disabled?: boolean; accessibilityLabel?: string }) {
  const { p, d } = useTheme();
  // A denied permission is recoverable: keep the control pressable so the user
  // can retry after changing the OS permission. Only an active journey owns
  // this singleton listener and should disable Home's control.
  const unavailable = !!disabled;
  const borderColor = denied && !unavailable ? p.stateDanger : d.card.border;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? (denied ? "Microphone permission required" : "Voice control")} accessibilityState={{ selected: listening, disabled: unavailable }}
      disabled={unavailable}
      testID="voice-fab" onPress={onToggle}
      style={{ position: "absolute", right: 16, bottom: 96, width: 52, height: 52, borderRadius: 26, backgroundColor: listening ? p.brand : d.card.bg, borderWidth: 1, borderColor, alignItems: "center", justifyContent: "center", elevation: 6, opacity: unavailable ? 0.65 : 1 }}>
      {listening
        ? <View style={{ flexDirection: "row", alignItems: "center", height: 20 }}>{[0, 1, 2, 3, 4].map(i => <Bar key={i} delay={i * 120} />)}</View>
        : <MicGlyph color={unavailable ? p.textFaint : p.brand} />}
    </Pressable>
  );
}
