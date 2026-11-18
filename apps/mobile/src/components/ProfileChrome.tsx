import { useState } from "react";
import { View, Pressable } from "react-native";
import { ChevronRight, ChevronLeft } from "lucide-react-native";
import { router } from "expo-router";
import { Text } from "./Text";
import { type Button3DIcon } from "./Button3D";
import { useTheme } from "../theme";

// profile-cards: a single row in the Profile card list. Icon slot, title, one-
// line description, chevron, and a bottom lip that mirrors Button3D's 3-D edge
// (a deep-coloured layer directly behind the face; the face rests `LIFT` px
// above it and translates DOWN onto it while pressed). No reanimated — a plain
// pressed flag is enough for a list row.
const LIFT = 4;

export function ProfileCard({
  icon: Icon, title, description, value, onPress, testID,
}: {
  icon: Button3DIcon;
  title: string;
  description: string;
  value?: string;
  onPress: () => void;
  testID?: string;
}) {
  const { p, d } = useTheme();
  const [pressed, setPressed] = useState(false);
  return (
    <View style={{ borderRadius: 20, backgroundColor: d.card.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        testID={testID}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={{
          flexDirection: "row", alignItems: "center", gap: 14,
          backgroundColor: d.card.bg, borderColor: d.card.border, borderWidth: 1,
          borderRadius: 20, padding: 16, minHeight: 72,
          marginBottom: LIFT, transform: [{ translateY: pressed ? LIFT : 0 }],
        }}
      >
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: p.brandSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon size={22} color={p.brand} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" color="muted" style={{ marginTop: 2 }}>{description}</Text>
        </View>
        {value ? <Text variant="caption" color="muted">{value}</Text> : null}
        <ChevronRight size={20} color={p.textMuted} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

// Back header shared by every Profile child screen. A child can be reached
// directly from another tab (for example Home → Vitals), so router.back() is
// not guaranteed to land on the Profile card list. Always target that list;
// ProfileGate remains mounted, so an already-entered password stays valid.
export function ProfileBack({ title }: { title: string }) {
  const { p } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, marginBottom: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        testID="profile-back"
        onPress={() => router.replace("/(user)/profile" as never)}
        hitSlop={12}
        style={{ minHeight: 44, minWidth: 44, alignItems: "flex-start", justifyContent: "center" }}
      >
        <ChevronLeft size={26} color={p.brand} strokeWidth={2.4} />
      </Pressable>
      <Text variant="title">{title}</Text>
    </View>
  );
}
