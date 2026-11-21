import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, PanResponder, Pressable, ScrollView, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import i18n from "../../i18n";
import { useTheme } from "../../theme";
import { Text } from "../Text";
import { Card } from "../Card";
import { Button3D } from "../Button3D";
import { Chip } from "../Chip";
import { cardPlacement } from "../../lib/tourLogic";
import { TOUR_STEPS } from "./steps";
import { useTour } from "./TourProvider";

const VEIL = "rgba(12,10,30,0.6)";
const FOOTER = 74; // custom footer height reserved at the bottom
// Reduced ("compact") card, used only when the full card fits beside the target
// on neither side (founder 2026-11-17 "tour cardsize reduction"): padding 16->10,
// header gap 8->4, title gap 6->2, body gap 14->8, step-1 hint hidden, body cap
// one line (it scrolls). COMPACT_SAVE is the fixed part of that saving in dp.
const COMPACT_SAVE = 2 * (16 - 10) + (8 - 4) + (6 - 2) + (14 - 8);
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

  // The card's real size comes from layout, not a constant: its height varies
  // with the step's copy and the screen width. natural = card - body viewport +
  // body content (true even while the card is capped); chrome = everything but
  // the body (header, title, buttons).
  const m = useRef({ card: 0, view: 0, content: 0, hint: 0 });
  const compactRef = useRef(false);
  const indexRef = useRef(index);
  indexRef.current = index;
  // Height the compact layout saves for this step (the hint shows on step 1 only).
  const saving = () => COMPACT_SAVE + (indexRef.current === 0 && m.current.hint ? m.current.hint + 10 : 0);
  // null until the first layout: the card then renders uncapped, so its first
  // measurement is its full natural height (no capped-then-grow round trip).
  const [size, setSize] = useState<{ natural: number; chrome: number } | null>(null);
  const remeasureCard = useCallback(() => {
    const { card, view, content } = m.current;
    if (!card) return;
    // Sizes are kept for the full layout; while compact, add the saving back.
    const add = compactRef.current ? saving() : 0;
    const natural = Math.round(card - view + content + add);
    const chrome = Math.round(card - view + add);
    setSize((s) => (s && Math.abs(s.natural - natural) < 1 && Math.abs(s.chrome - chrome) < 1 ? s : { natural, chrome }));
  }, []);

  const topSafe = insets.top + 6;
  const botSafe = height - FOOTER - insets.bottom - 6;
  const place = useMemo((): { top: number; maxH?: number; compact?: boolean } => {
    if (!size) return { top: Math.max(topSafe, (height - 190) / 2) }; // not measured yet
    if (!rect) {
      const maxH = Math.min(size.natural, botSafe - topSafe);
      return { top: Math.max(topSafe, topSafe + (botSafe - topSafe - maxH) / 2), maxH };
    }
    // Spotlight window + halo extend 9 px past the rect; plan around that box.
    return cardPlacement({
      hlY: rect.y - 9, hlH: rect.h + 18, tip: step.tip, cardH: size.natural,
      minH: size.chrome + Math.min(40, size.natural - size.chrome), margin: 6, topSafe, botSafe,
      reduced: { cardH: size.natural - saving(), minH: size.chrome - saving() + Math.min(20, size.natural - size.chrome) },
    });
  }, [rect, step.tip, topSafe, botSafe, size, height, index]);
  const compact = !!place.compact;
  compactRef.current = compact;
  useEffect(() => {
    if (active && rect) console.log("[tour] card", { step: step.id, rect, top: place.top, maxH: place.maxH, compact: place.compact, natural: size?.natural });
  }, [active, rect, step.id, place, size]);

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
        style={{ position: "absolute", left: 16, right: 16, top: place.top, maxHeight: place.maxH }}
        onLayout={(e) => { m.current.card = e.nativeEvent.layout.height; remeasureCard(); }}
      >
        <Card style={{ flexShrink: 1, ...(compact ? { padding: 10 } : null) }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: compact ? 4 : 8 }}>
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
          <Text variant="subtitle" style={{ marginBottom: compact ? 2 : 6 }}>{tr(step.titleKey)}</Text>
          <ScrollView
            testID="tour-body"
            style={{ flexGrow: 0, flexShrink: 1, marginBottom: compact ? 8 : 14 }}
            onLayout={(e) => { m.current.view = e.nativeEvent.layout.height; remeasureCard(); }}
            onContentSizeChange={(_w, h) => { m.current.content = h; remeasureCard(); }}
          >
            <Text variant="body" color="muted">{tr(step.bodyKey)}</Text>
          </ScrollView>
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
          {index === 0 && !compact ? (
            <Text
              testID="tour-hint"
              variant="caption"
              color="faint"
              style={{ marginTop: 10, textAlign: "center" }}
              onLayout={(e) => { m.current.hint = e.nativeEvent.layout.height; }}
            >
              {tr("tour.ui.hint")}
            </Text>
          ) : null}
        </Card>
      </View>
    </View>
  );
}
