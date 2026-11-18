import { useCallback, useEffect, useState } from "react";
import { Alert, Share } from "react-native";
import { Screen } from "../../../src/components/Screen";
import { Text } from "../../../src/components/Text";
import { PrivacyTab } from "../../../src/components/PrivacyTab";
import { supabase } from "../../../src/lib/supabase";
import { history } from "../../../src/services/history";
import i18n from "../../../src/i18n";

// "Download my data" export allowlist. Only non-secret, user-facing columns of
// `profiles` — explicitly NOT `select("*")`, which would push
// emergency_password_hash, word_salt, password_fail_count, locked_until and
// expo_push_token through the OS share sheet. Excluded on purpose: every hash /
// salt / *_fail_count / locked_until / token column, plus internal flags
// (is_admin, anomaly_flag, anomaly_reason) the owner did not set. Keep in sync
// with the profiles schema (0001 + later `alter table profiles`).
export const PROFILE_EXPORT_COLUMNS =
  "id, name, age, occupation, company, phone, photo_url, how_heard, " +
  "self_defence_training, tools, terms_version, terms_accepted_at, " +
  "consent_c7_training, consent_c7_answered_at, language, responder_opt_in, " +
  "phone_verified, last_geo, last_geo_at, role_last_used, created_at, " +
  "delete_requested_at, vitals_source";

// profile-cards: thin wrapper over the tested PrivacyTab. The download/delete
// callbacks were previously on the single-file profile screen; they live here now.
export default function PrivacyScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id ?? null)).catch(() => {}); }, []);

  // Export the profile row + journey list as JSON through the OS share sheet
  // (no server endpoint; on-device export only).
  const onDownloadData = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: profile } = await supabase.from("profiles").select(PROFILE_EXPORT_COLUMNS).eq("id", userId).single();
      const journeys = await history.journeys(userId);
      await Share.share({ message: JSON.stringify({ profile, journeys }, null, 2) });
    } catch (e) {
      console.warn("[profile] download data failed", (e as Error).message);
      Alert.alert(i18n.t("privacy.exportFailedTitle"), i18n.t("privacy.exportFailedBody"));
    }
  }, [userId]);

  // Delete account: confirm, then stamp delete_requested_at (0009). A 7-day
  // cooling window applies before anything is erased (ADR copy).
  const onDeleteAccount = useCallback(() => {
    if (!userId) return;
    Alert.alert(i18n.t("privacy.deleteConfirmTitle"), i18n.t("privacy.deleteConfirmBody"), [
      { text: i18n.t("privacy.deleteCancel"), style: "cancel" },
      {
        text: i18n.t("privacy.deleteConfirm"),
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("profiles").update({ delete_requested_at: new Date().toISOString() }).eq("id", userId);
            if (error) throw error;
            Alert.alert(i18n.t("privacy.deleteRequestedTitle"), i18n.t("privacy.deleteRequestedBody"));
          } catch (e) {
            console.warn("[profile] delete request failed", (e as Error).message);
            Alert.alert(i18n.t("privacy.deleteFailedTitle"), i18n.t("privacy.deleteFailedBody"));
          }
        },
      },
    ]);
  }, [userId]);

  return (
    <Screen scroll padded topInset={false} testID="profile-screen">
      <Text variant="title" accessibilityRole="header">{i18n.t("profile.tabPrivacy")}</Text>
      {userId ? <PrivacyTab userId={userId} onDownloadData={onDownloadData} onDeleteAccount={onDeleteAccount} /> : <Text variant="body" color="muted">…</Text>}
    </Screen>
  );
}
