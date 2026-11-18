import { View, Pressable } from "react-native";
// expo-router bundles its own @react-navigation copy, so the props its <Tabs>
// tabBar callback passes are typed by expo-router's build, not the top-level
// @react-navigation/bottom-tabs (whose same-named types are nominally distinct).
// Import the matching type from expo-router so the layouts type-check with no cast.
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs/types";
import { House, MapPinned, PlayCircle, User, Users, Video, HeartPulse } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { HoldSosButton } from "./HoldSosButton";
import { TourTarget } from "./tour/TourProvider";
import i18n from "../i18n";

type Role = "user" | "guardian";
type Slot = { key: string; route: string; icon?: LucideIcon; hintKey?: string };

// Centre slot (route "sos") is the hold button; the rest are real tabs.
const SLOTS: Record<Role, Slot[]> = {
  user: [
    { key: "home", route: "home", icon: House },
    { key: "regions", route: "regions", icon: MapPinned },
    { key: "sos", route: "sos" },
    { key: "simulate", route: "simulate", icon: PlayCircle },
    { key: "profile", route: "profile", icon: User },
  ],
  guardian: [
    { key: "trustees", route: "trustees", icon: Users },
    { key: "live", route: "live", icon: Video, hintKey: "footer.liveHint" },
    { key: "sos", route: "sos" },
    { key: "vitals", route: "vitals", icon: HeartPulse, hintKey: "footer.vitalsHint" },
    { key: "profile", route: "profile", icon: User },
  ],
};

// Glass bar: p.bgBase at 0.9 alpha (never a raw literal), per Global Constraints.
function alphaHex(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Accept only the tab-bar fields this component actually reads. expo-router's
// Tabs passes its own BottomTabBarProps whose `descriptors.options` type is not
// assignable to @react-navigation/bottom-tabs' (ColorValue vs string in the
// header options) — Picking state/navigation/insets (identical across both,
// from @react-navigation/core) sidesteps that mismatch without an `any` cast.
type FooterNavProps = Pick<BottomTabBarProps, "state" | "navigation" | "insets"> & { role: Role; onSos: () => void };

export function FooterNav({ state, navigation, insets, role, onSos }: FooterNavProps) {
  const { p, d } = useTheme();
  const slots = SLOTS[role];
  const bottom = insets?.bottom ?? 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", paddingBottom: bottom + 8, paddingTop: 8, paddingHorizontal: 6, backgroundColor: alphaHex(p.bgBase, 0.9), borderTopWidth: 1, borderTopColor: p.border }}>
      {slots.map((slot) => {
        if (slot.key === "sos") {
          return (
            <TourTarget key="sos" id="sos" style={{ flex: 1, alignItems: "center", marginTop: -22 }}>
              <HoldSosButton onTrigger={onSos} />
            </TourTarget>
          );
        }
        const routeIndex = state.routes.findIndex((r) => r.name === slot.route);
        const present = routeIndex >= 0;
        const active = present && state.index === routeIndex;
        const label = i18n.t(`footer.${slot.key}`);
        // Only the sos slot omits icon, and it returned above; the rest always set it.
        const Icon = slot.icon!;
        const onPress = () => {
          if (!present) return;
          const event = navigation.emit({ type: "tabPress", target: state.routes[routeIndex].key, canPreventDefault: true });
          if (event.defaultPrevented) return;
          // A tab can be entered through a deep child route (Home → Vitals).
          // Selecting Profile must always show its card list, while the gate
          // remains mounted so the password is not requested again.
          if (slot.key === "profile") navigation.navigate(slot.route, { screen: "index" });
          else if (!active) navigation.navigate(slot.route);
        };
        const iconColor = active ? d.onPrimary : p.textMuted;
        return (
          <Pressable key={slot.key} testID={`tab-${slot.key}`} disabled={!present}
            accessibilityRole="button" accessibilityLabel={label}
            accessibilityState={{ selected: active, disabled: !present }}
            accessibilityHint={present ? undefined : (slot.hintKey ? i18n.t(slot.hintKey) : undefined)}
            onPress={onPress}
            style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "flex-end", opacity: present ? 1 : 0.4, gap: 4 }}>
            {/* F6: the active tab reads as a 3-D pill — a deep edge sits directly
                behind the face and shows as an attached 3px bottom lip (same
                radius, no gap), matching Button3D. Inactive tabs stay flat. */}
            {active ? (
              <View style={{ borderRadius: 16 }}>
                <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, backgroundColor: d.btn.deep }} />
                <View style={{ backgroundColor: d.btn.mid, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, alignItems: "center", marginBottom: 3 }}>
                  <Icon size={22} color={iconColor} strokeWidth={2} />
                </View>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16, paddingVertical: 6, alignItems: "center" }}>
                <Icon size={22} color={iconColor} strokeWidth={2} />
              </View>
            )}
            <Text variant="label" color={active ? "primary" : "muted"}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
