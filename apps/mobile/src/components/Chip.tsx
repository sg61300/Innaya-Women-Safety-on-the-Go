import { View } from "react-native";
import { useTheme, type ChipKind } from "../theme";
import { Text } from "./Text";

export function Chip({ kind, label, dot, testID }: { kind: ChipKind; label: string; dot?: boolean; testID?: string }) {
  const { d } = useTheme();
  const c = d.chip[kind];
  return (
    <View testID={testID} accessibilityRole="text" accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: c.bg, alignSelf: "flex-start" }}>
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.fg }} /> : null}
      <Text variant="chip" color={c.fg}>{label}</Text>
    </View>
  );
}
