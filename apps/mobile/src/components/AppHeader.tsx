import { type ReactNode } from "react";
import { View, Image, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { APP_NAME } from "../config";
import i18n from "../i18n";

const emblem = require("../../assets/brand/emblem.png");

// F16: root tab routes show no back control; every other (pushed) route does.
// usePathname strips the group, so a detail is e.g. "/regions/<id>".
const ROOT_PATHS = new Set(["/home", "/regions", "/simulate", "/profile", "/trustees", "/sos", "/"]);

// F2 (founder live test 2026-09-07): one sticky top header, rendered by each
// route group's layout ABOVE the navigator, so it can never scroll under the
// status-bar clock. It owns the top safe-area inset (react-native-safe-area-context)
// so the emblem + wordmark always sit below the notch/clock on every screen.
export function AppHeader({ title = APP_NAME, right }: { title?: string; right?: ReactNode }) {
  const { p, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const canBack = !ROOT_PATHS.has(pathname);
  const goBack = () => pathname.startsWith("/profile/")
    ? router.replace("/(user)/profile" as never)
    : router.back();
  return (
    <View
      testID="app-header"
      style={{ paddingTop: insets.top, backgroundColor: p.bgBase, borderBottomWidth: 1, borderBottomColor: p.border }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          {canBack ? (
            <Pressable
              testID="app-header-back"
              accessibilityRole="button"
              accessibilityLabel={i18n.t("common.back")}
              onPress={goBack}
              hitSlop={12}
              style={{ minWidth: 36, minHeight: 44, alignItems: "flex-start", justifyContent: "center" }}
            >
              {/* Founder 2026-10-15 (3-b): white chevron on dark palettes
                  (midnight, darkCherry); normal p.text on the 6 light palettes,
                  pending a later light-theme follow-up. */}
              <ChevronLeft size={26} color={isDark ? "#FFFFFF" : p.text} strokeWidth={2.2} />
            </Pressable>
          ) : null}
          <Image source={emblem} style={{ width: 28, height: 28, resizeMode: "contain" }} accessibilityIgnoresInvertColors />
          <Text variant="display" style={{ letterSpacing: 1 }}>{title}</Text>
        </View>
        {right ?? null}
      </View>
    </View>
  );
}
