import { View, Pressable } from "react-native";
// expo-router bundles its own @react-navigation copy, so the props its <Tabs>
// tabBar callback passes are typed by expo-router's build, not the top-level
// @react-navigation/bottom-tabs (whose same-named types are nominally distinct).
// Import the matching type from expo-router so the layouts type-check with no cast.
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs/types";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Illustration, type IllustrationName } from "./Illustration";
import { Heartbeat } from "./Heartbeat";
import { HoldSosButton } from "./HoldSosButton";
import { TourTarget } from "./tour/TourProvider";
import i18n from "../i18n";

type Role = "user" | "guardian";
type Slot = { key: string; route: string; img?: IllustrationName; hintKey?: string };

// Footer tabs now use the rose-gold charm illustrations (founder 2026-10-11):
// charm image at 28, unselected tabs are the same image faded (~0.45), the
// selected tab sits on a plum pill (#2A2238 = p.bgCard2) with a rose-gold edge
// (#C6997A = p.rose). Centre slot (route "sos") is the hold button, unchanged.
const CHARM_SIZE = 28;
const SLOTS: Record<Role, Slot[]> = {
  user: [
    { key: "home", route: "home", img: "tab-home" },
    { key: "regions", route: "regions", img: "tab-regions" },
    { key: "sos", route: "sos" },
    { key: "simulate", route: "simulate", img: "tab-simulate" },
    { key: "profile", route: "profile", img: "tab-profile" },
  ],
  guardian: [
    { key: "trustees", route: "trustees", img: "tab-trustees" },
    { key: "live", route: "live", img: "tab-live", hintKey: "footer.liveHint" },
    { key: "sos", route: "sos" },
    { key: "vitals", route: "vitals", img: "tab-vitals", hintKey: "footer.vitalsHint" },
    { key: "profile", route: "profile", img: "tab-profile" },
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
  const { p } = useTheme();
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
        // Only the sos slot omits img, and it returned above; the rest always set it.
        const img = slot.img!;
        // Founder 2026-10-12: the Guardian app's Vitals tab charm beats like a heart.
        const charm = slot.key === "vitals"
          ? <Heartbeat><Illustration name={img} size={CHARM_SIZE} /></Heartbeat>
          : <Illustration name={img} size={CHARM_SIZE} />;
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
        return (
          <Pressable key={slot.key} testID={`tab-${slot.key}`} disabled={!present}
            accessibilityRole="button" accessibilityLabel={label}
            accessibilityState={{ selected: active, disabled: !present }}
            accessibilityHint={present ? undefined : (slot.hintKey ? i18n.t(slot.hintKey) : undefined)}
            onPress={onPress}
            style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "flex-end", opacity: present ? 1 : 0.4, gap: 4 }}>
            {/* Selected: the charm sits on a plum pill (p.bgCard2) with a rose-gold
                edge (p.rose). Unselected: the same charm faded to ~0.45. */}
            {active ? (
              <View style={{ backgroundColor: p.bgCard2, borderWidth: 1, borderColor: p.rose, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16, alignItems: "center" }}>
                {charm}
              </View>
            ) : (
              <View style={{ paddingHorizontal: 14, paddingVertical: 6, alignItems: "center", opacity: 0.45 }}>
                {charm}
              </View>
            )}
            <Text variant="label" color={active ? "primary" : "muted"}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
