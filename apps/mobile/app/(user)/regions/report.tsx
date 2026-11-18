import { useState } from "react";
import { View, Pressable, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { Button3D } from "../../../src/components/Button3D";
import { regions, REASON_KEYS, TIME_KEYS } from "../../../src/services/regions";
import { supabase } from "../../../src/lib/supabase";
import { useTheme } from "../../../src/theme";
import { TYPE } from "../../../src/theme/typography";
import i18n from "../../../src/i18n";

// F14 (founder live test 2026-09-07): "Add my report" is its own route (it used
// to navigate back to the Regions list and render the form there). Fields:
// reason (type), note, and time (when). Submit -> success toast -> back to detail.
function SelectChip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const { p, d } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
      style={{ minHeight: 48, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: selected ? d.chip.brand.bg : "transparent", borderWidth: 1, borderColor: selected ? "transparent" : p.border }}>
      <Text variant="label" color={selected ? d.chip.brand.fg : "muted"}>{label}</Text>
    </Pressable>
  );
}

export default function AddReportScreen() {
  const { p, d } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; radius?: string }>();
  const lat = Number(params.lat) || 28.6139;
  const lng = Number(params.lng) || 77.209;
  // F5: the raw radius param was unexplained; offer three plain-language sizes.
  const AREA_SIZES = [
    { key: "corner", m: 50 },
    { key: "block", m: 150 },
    { key: "neighbourhood", m: 500 },
  ] as const;

  const [radiusM, setRadiusM] = useState<number>(Number(params.radius) || 150);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true); setError(false);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) { setError(true); return; }
      const regionId = await regions.report({ lat, lng, radiusM, reason, details: details.trim() || undefined, timeOfDay: timeOfDay ?? undefined }, uid);
      setDone(true);
      // F4: return to the Regions list (not the detail) with the reported area
      // flagged so the user can see where their report landed.
      setTimeout(() => router.navigate({ pathname: "/(user)/regions", params: { highlight: regionId, ts: String(Date.now()) } }), 900);
    } catch (e) {
      console.warn("[regions/report] submit failed", (e as Error).message);
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll padded topInset={false} testID="add-report-screen">
      <Text variant="title" style={{ marginTop: 12, marginBottom: 12 }}>{i18n.t("regions.reportTitle")}</Text>

      <Card>
        <Text variant="label" color="muted" style={{ marginBottom: 6 }}>{i18n.t("regions.reasonLabel")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {REASON_KEYS.map((k) => (
            <SelectChip key={k} testID={`report-reason-${k}`} label={i18n.t(`regions.reason.${k}`)} selected={reason === k} onPress={() => setReason(k)} />
          ))}
        </View>

        <Text variant="label" color="muted" style={{ marginTop: 14, marginBottom: 2 }}>{i18n.t("regions.areaSizeLabel")}</Text>
        <Text variant="caption" color="faint" style={{ marginBottom: 8 }}>{i18n.t("regions.areaSizeHint")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {AREA_SIZES.map((a) => (
            <SelectChip key={a.key} testID={`report-area-${a.key}`} label={i18n.t(`regions.areaSize.${a.key}`)} selected={radiusM === a.m} onPress={() => setRadiusM(a.m)} />
          ))}
        </View>

        <Text variant="label" color="muted" style={{ marginTop: 14, marginBottom: 6 }}>{i18n.t("regions.noteLabel")}</Text>
        <TextInput
          testID="report-note"
          accessibilityLabel={i18n.t("regions.noteLabel")}
          value={details}
          onChangeText={setDetails}
          placeholder={i18n.t("regions.notePlaceholder")}
          placeholderTextColor={d.input.placeholder}
          multiline
          style={{ minHeight: 72, padding: 12, borderRadius: 14, backgroundColor: d.input.bg, borderWidth: 1, borderColor: d.input.border, fontFamily: TYPE.body.fontFamily, fontSize: TYPE.body.fontSize, color: p.text, textAlignVertical: "top" }}
        />

        <Text variant="label" color="muted" style={{ marginTop: 14, marginBottom: 6 }}>{i18n.t("regions.timeLabel")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {TIME_KEYS.map((k) => (
            <SelectChip key={k} testID={`report-time-${k}`} label={i18n.t(`regions.time.${k}`)} selected={timeOfDay === k} onPress={() => setTimeOfDay(k)} />
          ))}
        </View>

        <Text variant="caption" color="faint" style={{ marginTop: 12 }}>{i18n.t("regions.fiveRule")}</Text>
        {error ? <Text testID="report-error" variant="caption" color={p.stateDanger} style={{ marginTop: 10 }}>{i18n.t("regions.reportError")}</Text> : null}
        {done ? <Text testID="report-success" variant="body" color={p.stateSafe} style={{ marginTop: 10 }}>{i18n.t("regions.reportSuccess")}</Text> : null}
      </Card>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <Button3D variant="ghost" label={i18n.t("regions.cancel")} onPress={() => router.back()} testID="report-cancel" />
        <Button3D full label={i18n.t("regions.submit")} onPress={submit} disabled={!reason || done} loading={submitting} testID="report-submit" />
      </View>
    </Screen>
  );
}
