import { View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Button3D } from "./Button3D";
import { Card } from "./Card";
import type { Button3DIcon } from "./Button3D";
import i18n from "../i18n";

// One permission step (Task 18 / Amendment 18). Card with a 36 dp brand-soft icon
// tile, reason in body copy, progress dots, primary "Allow" and ghost "Not now".
export function PermissionCard({
  title,
  reason,
  index,
  total,
  icon: Icon,
  onAllow,
  onNotNow,
  busy,
}: {
  title: string;
  reason: string;
  index: number; // zero-based
  total: number;
  icon: Button3DIcon;
  onAllow: () => void;
  onNotNow: () => void;
  busy?: boolean;
}) {
  const { p } = useTheme();
  return (
    <Card variant="raised">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon size={20} color={p.brand} strokeWidth={2} />
        </View>
        <Text variant="subtitle" style={{ flex: 1 }}>{title}</Text>
      </View>

      <Text variant="body" color="muted" style={{ marginBottom: 20 }}>{reason}</Text>

      <View style={{ flexDirection: "row", gap: 6, marginBottom: 18 }} accessibilityLabel={i18n.t("perm.progress", { index: index + 1, total })}>
        {Array.from({ length: total }).map((_, k) => (
          <View
            key={k}
            style={{ width: k === index ? 20 : 8, height: 8, borderRadius: 4, backgroundColor: k === index ? p.brand : p.border }}
          />
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <Button3D testID="perm-allow" label={i18n.t("perm.allow")} onPress={onAllow} loading={busy} full />
        <Button3D testID="perm-later" variant="ghost" label={i18n.t("perm.later")} onPress={onNotNow} disabled={busy} full />
      </View>
    </Card>
  );
}
