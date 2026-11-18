import { useEffect, useMemo, useRef } from "react";
import { Dimensions, PanResponder, Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import i18n from "../../i18n";
import { useTheme } from "../../theme";
import { Text } from "../Text";
import { Card } from "../Card";
import { Button3D } from "../Button3D";
import { Chip } from "../Chip";
import { cardTop } from "../../lib/tourLogic";
import { TOUR_STEPS } from "./steps";
import { useTour } from "./TourProvider";

const VEIL = "rgba(12,10,30,0.6)";
const FOOTER = 74; // custom footer height reserved at the bottom
// Nested tour copy lives under en.json `tour.*`; the i18n instance runs with
// keySeparator off (flat dotted keys elsewhere), so read these with a per-call
// separator.
const tr = (key: string) => i18n.t(key, { keySeparator: "." });

export function TourOverlay() {
  const { active, index, rect, next, prev, close } = useTour();
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get("window");

  const pulse = useSharedValue(0);
  useEffect(() => {
    if (active) {
      pulse.value = 0;
      pulse.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
    } else {
      cancelAnimation(pulse);
    }
    return () => cancelAnimation(pulse);
  }, [active, pulse]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.5, transform: [{ scale: 1 + pulse.value * 0.04 }] }));

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -48) next();
        else if (g.dx > 48) prev();
      },
    })
  ).current;

  const step = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;
  const isLast = index === total - 1;

  const topSafe = insets.top + 6;
  const botSafe = height - FOOTER - insets.bottom - 6;
  const top = useMemo(() => {
    if (!rect) return Math.max(topSafe, (height - 190) / 2);
    return cardTop({ hlY: rect.y, hlH: rect.h, tip: step.tip, topSafe, botSafe });
  }, [rect, step.tip, topSafe, botSafe, height]);

  if (!active) return null;

  const win = rect
    ? { x: Math.max(0, rect.x - 6), y: Math.max(0, rect.y - 6), w: rect.w + 12, h: rect.h + 12 }
    : null;

  return (
    <View testID="tour-overlay" style={{ position: "absolute", inset: 0 }} pointerEvents="box-none">
      {/* Dim veil — four rectangles around the spotlight window, or full-screen */}
      {win ? (
        <>
          <View style={{ position: "absolute", left: 0, top: 0, width, height: win.y, backgroundColor: VEIL }} />
          <View style={{ position: "absolute", left: 0, top: win.y + win.h, width, height: Math.max(0, height - win.y - win.h), backgroundColor: VEIL }} />
          <View style={{ position: "absolute", left: 0, top: win.y, width: win.x, height: win.h, backgroundColor: VEIL }} />
          <View style={{ position: "absolute", left: win.x + win.w, top: win.y, width: Math.max(0, width - win.x - win.w), height: win.h, backgroundColor: VEIL }} />
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: win.x - 3, top: win.y - 3, width: win.w + 6, height: win.h + 6, borderRadius: 20, borderWidth: 2, borderColor: p.brandBright }, haloStyle]} />
        </>
      ) : (
        <View style={{ position: "absolute", inset: 0, backgroundColor: VEIL }} />
      )}

      {/* Tooltip card */}
      <View
        {...pan.panHandlers}
        testID="tour-card"
        style={{ position: "absolute", left: 16, right: 16, top }}
      >
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text variant="title" style={{ fontSize: 20 }}>{step.emoji}</Text>
              <Chip kind="brand" label={tr(step.tagKey)} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text variant="label" color="muted">{index + 1}/{total}</Text>
              <Pressable
                testID="tour-close"
                accessibilityRole="button"
                accessibilityLabel={tr("tour.ui.close")}
                onPress={close}
                hitSlop={12}
                style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: p.bgRaised }}
              >
                <Text variant="bodyStrong" color="muted">✕</Text>
              </Pressable>
            </View>
          </View>
          <Text variant="subtitle" style={{ marginBottom: 6 }}>{tr(step.titleKey)}</Text>
          <Text variant="body" color="muted" style={{ marginBottom: 14 }}>{tr(step.bodyKey)}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {index > 0 ? (
              <View style={{ flex: 1 }}>
                <Button3D label={tr("tour.ui.back")} variant="ghost" full testID="tour-prev" onPress={prev} />
              </View>
            ) : null}
            <View style={{ flex: 2 }}>
              <Button3D label={isLast ? tr("tour.ui.done") : tr("tour.ui.next")} full testID="tour-next" onPress={isLast ? close : next} />
            </View>
          </View>
          {index === 0 ? (
            <Text variant="caption" color="faint" style={{ marginTop: 10, textAlign: "center" }}>
              {tr("tour.ui.hint")}
            </Text>
          ) : null}
        </Card>
      </View>
    </View>
  );
}
