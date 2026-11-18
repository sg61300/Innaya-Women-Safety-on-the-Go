import { View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export type ActionLogItem = { label: string; done: boolean; detail?: string };
export type ActionLogTone = "onCritical" | "default";

export function ActionLog({ items, tone }: { items: ActionLogItem[]; tone: ActionLogTone }) {
  const { p, d } = useTheme();
  const onCritical = tone === "onCritical";
  const labelColor = onCritical ? d.onPrimary : p.text;
  const detailColor = onCritical ? "rgba(255,255,255,0.82)" : p.textMuted;
  const doneFill = onCritical ? "#FFFFFF" : d.sos;
  const pendingBorder = onCritical ? "rgba(255,255,255,0.55)" : p.border;

  return (
    <View style={{ gap: 12, alignSelf: "stretch" }}>
      {items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          {it.done ? (
            <View
              testID="actionlog-done"
              style={{ width: 20, height: 20, borderRadius: 10, marginTop: 2, backgroundColor: doneFill }}
            />
          ) : (
            <View
              testID="actionlog-pending"
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                marginTop: 2,
                borderWidth: 2,
                borderColor: pendingBorder,
              }}
            />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" color={labelColor}>
              {it.label}
            </Text>
            {it.detail ? (
              <Text variant="caption" color={detailColor}>
                {it.detail}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
