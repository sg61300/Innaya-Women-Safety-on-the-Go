import { useRef, useState } from "react";
import { View, Pressable, type NativeSyntheticEvent, type NativeScrollEvent, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button3D } from "../../src/components/Button3D";
import { TextLink } from "../../src/components/TextLink";
import { DisclaimerModal } from "../../src/components/DisclaimerModal";
import { Illustration } from "../../src/components/Illustration";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/store/session";
import { events } from "../../src/lib/events";
import { TERMS_VERSION, BULLETS } from "../../src/data/terms";
import { useTheme } from "../../src/theme";
import i18n from "../../src/i18n";

// C1 legal consent gate (Legal §14): blocking — no footer, no SOS, no skip.
// Founder ruling (s25, phone test 2026-09-24): the "read and agree" checkbox is
// DISABLED until the user has scrolled the disclaimer to the end (and immediately
// when the content already fits without scrolling). Muted helper text shows the
// reason until then. This REVERSES the s20 ruling below (checkbox tappable
// immediately); the newer founder feedback wins. The 20 s unlock timer stays gone.
// Founder ruling (s20, superseded for the enable-timing): ticking the box is the
// affirmative act (pre-ticked boxes stay prohibited); the button still unlocks
// only after the checkbox is ticked.
// b16 (Samsung gesture nav): the whole screen scrolls like every other setup
// step (<Screen scroll>) instead of nesting the terms in an inner ScrollView
// inside a flex:1 chain. Under <Screen padded> the outer height was unbounded, so
// the six bullets pushed the checkbox under the nav bar and the button off-screen
// with no way to scroll. The full legal text is reached via "Read the full
// disclaimer" (the shared modal); the six bullets remain the inline layered notice.
export default function ConsentScreen() {
  const { p, d } = useTheme();
  const insets = useSafeAreaInsets();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState(false);
  // X2a: the checkbox stays disabled until the disclaimer is scrolled to the end.
  const [reachedEnd, setReachedEnd] = useState(false);
  const viewportH = useRef(0);
  const { userId, profile, set } = useSession();

  // Enable as soon as the last line is visible, or immediately if the whole
  // notice already fits on screen (nothing to scroll).
  const markEndIfReached = (contentH: number, offsetY: number, layoutH: number) => {
    if (layoutH > 0 && contentH <= layoutH + 1) return setReachedEnd(true);
    if (offsetY + layoutH >= contentH - 24) setReachedEnd(true);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    viewportH.current = layoutMeasurement.height;
    markEndIfReached(contentSize.height, contentOffset.y, layoutMeasurement.height);
  };
  const onContentSizeChange = (_w: number, h: number) => {
    if (viewportH.current > 0) markEndIfReached(h, 0, viewportH.current);
  };
  const onScrollLayout = (e: LayoutChangeEvent) => {
    viewportH.current = e.nativeEvent.layout.height;
  };

  async function agree() {
    if (!checked || busy) return;
    setBusy(true);
    setSaveErr(null);
    try {
      const at = new Date().toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({ terms_version: TERMS_VERSION, terms_accepted_at: at })
        .eq("id", userId);
      if (error) throw error;
      await events.log("consent", { version: TERMS_VERSION });
      set({ profile: { ...(profile ?? {}), terms_version: TERMS_VERSION, terms_accepted_at: at } });
      router.replace("/(setup)/training-consent");
    } catch (e) {
      setSaveErr(i18n.t("consent.saveError"));
      console.warn("[consent] save failed", (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen
      scroll
      padded
      testID="consent-screen"
      scrollProps={{ onScroll, onContentSizeChange, onLayout: onScrollLayout, scrollEventThrottle: 16 }}
    >
      {/* F4/b16: the bottom safe-area inset plus Screen's scroll paddingBottom (100)
          keeps the "Agree and continue" button clear of the Android nav bar. */}
      <View style={{ paddingTop: 24, paddingBottom: insets.bottom }}>
        <View style={{ alignItems: "center", marginBottom: 12 }}>
          <Illustration name="consent-disclaimer" size={92} testID="consent-art" />
        </View>
        <Text variant="titleSerif">{i18n.t("consent.heading")}</Text>
        {BULLETS.map((b) => (
          <View key={b} style={{ flexDirection: "row", marginTop: 10 }}>
            <Text variant="body" color="muted" style={{ marginRight: 8 }}>
              •
            </Text>
            <Text variant="body" color="muted" style={{ flex: 1 }}>
              {b}
            </Text>
          </View>
        ))}

        {/* F3: open the full disclaimer in the shared modal, exactly as signup does. */}
        <View style={{ alignItems: "flex-start", marginTop: 20, marginBottom: 8 }}>
          <TextLink testID="consent-disclaimer" label={i18n.t("consent.readFull")} onPress={() => setDisclaimer(true)} />
        </View>
        <DisclaimerModal visible={disclaimer} onClose={() => setDisclaimer(false)} />

        <Pressable
          testID="consent-check"
          accessibilityRole="checkbox"
          accessibilityLabel={i18n.t("consent.readAgree")}
          accessibilityState={{ checked, disabled: !reachedEnd }}
          disabled={!reachedEnd}
          onPress={() => setChecked((v) => !v)}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", minHeight: 48, opacity: reachedEnd ? 1 : 0.5 }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: p.brand,
              backgroundColor: checked ? d.btn.mid : "transparent",
              marginRight: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {checked ? (
              <Text variant="caption" color={d.btn.label}>
                ✓
              </Text>
            ) : null}
          </View>
          <Text variant="body" style={{ flex: 1 }}>
            {i18n.t("consent.readAgree")}
          </Text>
        </Pressable>

        {!reachedEnd ? (
          <Text testID="consent-scroll-hint" variant="caption" color="muted" style={{ marginTop: 4 }}>
            {i18n.t("consent.scrollToEnd")}
          </Text>
        ) : null}

        {saveErr ? (
          <Text variant="caption" color={p.stateDanger} style={{ marginTop: 8 }}>
            {saveErr}
          </Text>
        ) : null}

        <Button3D
          testID="consent-agree"
          full
          label={i18n.t("consent.agree")}
          onPress={agree}
          disabled={!checked}
          loading={busy}
        />
      </View>
    </Screen>
  );
}
