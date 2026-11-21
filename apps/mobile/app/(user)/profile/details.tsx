import { useEffect, useState } from "react";
import { View } from "react-native";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { Card } from "../../../src/components/Card";
import { useTheme } from "../../../src/theme";
import { supabase } from "../../../src/lib/supabase";
import i18n from "../../../src/i18n";

// profile-cards: a read-only summary of the user's core profile — name, phone,
// occupation — plus the emergency-contacts count. The onboarding form
// (app/(setup)/profile.tsx) remains the place these are entered; this card
// surfaces them inside Profile without duplicating that flow. (There is no
// `city` column on `profiles`, so it is not shown; noted for follow-up.)
type Row = { name: string | null; phone: string | null; occupation: string | null };

function DetailRow({ label, value }: { label: string; value: string }) {
  const { d } = useTheme();
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: d.card.border }}>
      <Text variant="label" color="muted">{label}</Text>
      <Text variant="body" style={{ marginTop: 2 }}>{value}</Text>
    </View>
  );
}

export default function DetailsScreen() {
  const [row, setRow] = useState<Row | null>(null);
  const [contactCount, setContactCount] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const id = data?.user?.id;
      if (!id) return;
      const [{ data: p }, { data: cs }] = await Promise.all([
        supabase.from("profiles").select("name, phone, occupation").eq("id", id).single(),
        supabase.from("contacts").select("id").eq("owner_id", id),
      ]);
      setRow((p as Row) ?? { name: null, phone: null, occupation: null });
      setContactCount(Array.isArray(cs) ? cs.length : 0);
    }).catch(() => {});
  }, []);

  const dash = i18n.t("profile.notSet");
  return (
    <Screen scroll padded topInset={false} testID="profile-screen">
      <Text variant="title" accessibilityRole="header">{i18n.t("profile.tabDetails")}</Text>
      <Card testID="profile-details" style={{ gap: 0 }}>
        <DetailRow label={i18n.t("profile.name")} value={row?.name || dash} />
        <DetailRow label={i18n.t("profile.phone")} value={row?.phone || dash} />
        <DetailRow label={i18n.t("profile.occupation")} value={row?.occupation || dash} />
        <View style={{ paddingVertical: 12 }}>
          <Text variant="label" color="muted">{i18n.t("profile.contacts")}</Text>
          <Text variant="body" style={{ marginTop: 2 }}>{contactCount === null ? dash : String(contactCount)}</Text>
        </View>
      </Card>
    </Screen>
  );
}
