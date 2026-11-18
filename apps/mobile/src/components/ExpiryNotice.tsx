import { View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Card } from "./Card";
import { Button3D } from "./Button3D";
import { useJourney } from "../store/journey";
import { runner } from "../services/protocolRunner";
import i18n from "../i18n";

// ADR-042 / R47c: the phone came back to an alarm the server had already archived
// (expired after 15 min of silence, or ended from another device). A guardian can
// NEVER close an alarm, so she confirms with a verified are-you-safe; until then a
// dismissible banner offers "Not safe? Hold SOS". Mounted once in (user)/_layout.
export function ExpiryNotice({ onSos }: { onSos?: () => void } = {}) {
  const { p } = useTheme();
  const expiry = useJourney((s) => s.expiry);
  const challenge = useJourney((s) => s.challenge);
  // While the are-you-safe modal is open it owns the screen; the banner is the
  // residual state before/after that verified check.
  if (!expiry || challenge) return null;

  const hm = new Date(expiry.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const body = expiry.resolved
    ? i18n.t("expiry.resolved")
    : expiry.variant === "ended"
      ? i18n.t("expiry.endedElsewhere")
      : i18n.t("expiry.expiredAt", { time: hm });

  return (
    <View
      testID="expiry-notice"
      pointerEvents="box-none"
      style={{ position: "absolute", left: 12, right: 12, top: 48 }}
    >
      <Card style={{ gap: 12, borderColor: p.brand }}>
        <Text variant="bodyStrong" color="primary" testID="expiry-notice-title">
          {i18n.t("expiry.title")}
        </Text>
        <Text variant="body" color="muted" testID="expiry-notice-body">
          {body}
        </Text>
        {!expiry.resolved ? (
          <Button3D
            full
            label={i18n.t("expiry.imSafe")}
            testID="expiry-notice-safe"
            onPress={() => runner.openExpiryChallenge()}
          />
        ) : null}
        <Button3D
          full
          variant="danger"
          label={i18n.t("expiry.notSafeSos")}
          testID="expiry-notice-sos"
          onPress={onSos ?? (() => void runner.send({ type: "SOS", mode: "siren" }))}
        />
        {expiry.resolved ? (
          <Button3D
            full
            variant="ghost"
            label={i18n.t("expiry.dismiss")}
            testID="expiry-notice-dismiss"
            onPress={() => useJourney.getState().set({ expiry: null })}
          />
        ) : null}
      </Card>
    </View>
  );
}
