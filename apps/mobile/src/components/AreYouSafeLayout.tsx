import { View, TextInput } from "react-native";
import { useTheme, ensureContrast, blend, toHex } from "../theme";
import { Text } from "./Text";
import { Chip } from "./Chip";
import { Button3D } from "./Button3D";
import { CountdownRing } from "./CountdownRing";
import { TYPE } from "../theme/typography";
import i18n from "../i18n";

// Presentational ARE-YOU-SAFE check-in (UX §3.14). Calm — a soft brand wash over
// the base, not the prototype's dark overlay. It owns NO timers or protocol
// state: Task 27's AreYouSafeModal ticks `seconds` and renders this with total=5.
// There is deliberately no close/dismiss control.
export function AreYouSafeLayout({
  seconds,
  total,
  typed,
  onTyped,
  onSafe,
  onDanger,
  speakerPromptFired,
  error,
  practice = false,
}: {
  seconds: number;
  total: number;
  typed: string;
  onTyped: (v: string) => void;
  onSafe: () => void;
  onDanger: () => void;
  speakerPromptFired: boolean;
  error?: string | null;
  // Drill only: show a "Practice · not a real alert" badge. Defaults false so the
  // real check-in renders exactly as before (byte-identical).
  practice?: boolean;
}) {
  const { p, d } = useTheme();
  const urgent = seconds <= 2;
  // The calm brandSoft wash lightens the base enough that plain textMuted dips
  // below 4.5:1 in a couple of light palettes; guard the muted copy against the
  // actual blended surface (same darkenUntil/ensureContrast guard as d.* tokens).
  const washBg = toHex(blend(p.brandSoft, p.bgBase));
  const mutedOnWash = ensureContrast(p.textMuted, washBg);

  return (
    <View style={{ flex: 1, backgroundColor: p.bgBase }}>
      <View
        testID="areyousafe-layout"
        style={{ flex: 1, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center", padding: 24, gap: 18 }}
      >
        {practice ? (
          <Chip kind="brand" label={i18n.t("practice.notRealAlert")} />
        ) : null}

        <Chip
          kind={urgent ? "critical" : "brand"}
          label={i18n.t(urgent ? "areYouSafe.pillAlerting" : "areYouSafe.pillCheckIn")}
          dot
        />

        <CountdownRing seconds={seconds} total={total} urgentAt={2} />

        <View style={{ alignItems: "center", gap: 6 }}>
          <Text variant="display">{i18n.t("areYouSafe.title")}</Text>
          <Text variant="body" color={mutedOnWash}>{i18n.t("areYouSafe.sub")}</Text>
          {speakerPromptFired ? (
            <Text variant="caption" color={mutedOnWash}>{i18n.t("areYouSafe.listening")}</Text>
          ) : null}
        </View>

        <TextInput
          testID="areyousafe-input"
          accessibilityLabel={i18n.t("areYouSafe.placeholder")}
          value={typed}
          onChangeText={onTyped}
          placeholder={i18n.t("areYouSafe.placeholder")}
          placeholderTextColor={d.input.placeholder}
          returnKeyType="go"
          onSubmitEditing={onSafe}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            alignSelf: "stretch",
            minHeight: 52,
            paddingHorizontal: 16,
            borderRadius: 14,
            backgroundColor: d.input.bg,
            borderWidth: 1,
            borderColor: d.input.border,
            fontFamily: TYPE.body.fontFamily,
            fontSize: TYPE.body.fontSize,
            color: p.text,
          }}
        />
        {error ? <Text testID="areyousafe-error" variant="caption" color={d.sos}>{error}</Text> : null}

        <View style={{ alignSelf: "stretch", gap: 12 }}>
          <Button3D label={i18n.t("areYouSafe.safe")} onPress={onSafe} full testID="areyousafe-confirm" />
          <Button3D label={i18n.t("areYouSafe.danger")} onPress={onDanger} variant="danger" full testID="areyousafe-danger" />
        </View>
      </View>
    </View>
  );
}
