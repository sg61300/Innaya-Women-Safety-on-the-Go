import { useEffect, useState } from "react";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { HistoryTab } from "../../../src/components/HistoryTab";
import { supabase } from "../../../src/lib/supabase";
import i18n from "../../../src/i18n";

// profile-cards: thin wrapper over the tested HistoryTab.
export default function HistoryScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id ?? null)).catch(() => {}); }, []);
  return (
    <Screen scroll padded topInset={false} testID="profile-screen">
      <Text variant="title" accessibilityRole="header">{i18n.t("profile.tabHistory")}</Text>
      {userId ? <HistoryTab userId={userId} /> : <Text variant="body" color="muted">…</Text>}
    </Screen>
  );
}
