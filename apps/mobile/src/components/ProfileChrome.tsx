import { useState } from "react";
import { View, Pressable } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { Text } from "./Text";
import { type Button3DIcon } from "./Button3D";
import { Heartbeat } from "./Heartbeat";
import { useTheme } from "../theme";

// profile-cards: a single row in the Profile card list. Icon slot, title, one-
// line description, chevron, and a bottom lip that mirrors Button3D's 3-D edge
// (a deep-coloured layer directly behind the face; the face rests `LIFT` px
// above it and translates DOWN onto it while pressed). No reanimated — a plain
// pressed flag is enough for a list row.
const LIFT = 4;

export function ProfileCard({
  icon: Icon, title, description, value, onPress, testID, pulse,
}: {
  icon: Button3DIcon;
  title: string;
  description: string;
  value?: string;
  onPress: () => void;
  testID?: string;
  // Founder 2026-10-12: the Vitals row's icon beats "like a heartbeat".
  pulse?: boolean;
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
          {pulse ? (
            <Heartbeat><Icon size={22} color={p.brand} strokeWidth={2.2} /></Heartbeat>
          ) : (
            <Icon size={22} color={p.brand} strokeWidth={2.2} />
          )}
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

// Phase 3 (founder 2026-10-15): the former ProfileBack/BackHeader/BackChevron
// title-side back control was removed. The sole back control is the top-bar
// one (AppHeader); screen titles are now plain header Text. Only ProfileCard
// remains here.
