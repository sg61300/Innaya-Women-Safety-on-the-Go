import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "../src/i18n";
import { supabase } from "../src/lib/supabase";
import { useSession } from "../src/store/session";
import { useTheme } from "../src/theme";
import { TERMS_VERSION } from "../src/lib/terms";
import {
  TESTER_TERMS_VERSION_KEY,
  TESTER_TERMS_ACCEPTED_AT_KEY,
  testerTermsAccepted,
} from "../src/lib/testerTerms";
import { decideRoute, type RouteProfile } from "../src/lib/route";
import { secureWords } from "../src/services/secureWords";
import { registerPush } from "../src/services/push";

// The `/` route. Rendered inside the root navigator, so router.replace() here
// lands reliably (the old effect lived in _layout and its replace was dropped
// before any screen mounted — the app showed expo-router's "Unmatched Route").
export default function Index() {
  const router = useRouter();
  const setSession = useSession((s) => s.set);
  const { p } = useTheme();

  useEffect(() => {
    let active = true;
    (async () => {
      const storedLang = await AsyncStorage.getItem("vaira.language");
      if (storedLang && storedLang !== i18n.language) await i18n.changeLanguage(storedLang);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      let profile: RouteProfile = null;
      if (session) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        profile = data ?? null;
        setSession({
          userId: session.user.id,
          role: (profile?.role_last_used as "user" | "guardian") ?? "user",
          profile,
        });
        // The account language wins over the device's stored value so a
        // signed-in user sees the same language across devices.
        const pl = profile?.language;
        if ((pl === "en" || pl === "hi" || pl === "kn") && pl !== i18n.language) {
          await i18n.changeLanguage(pl);
          await AsyncStorage.setItem("vaira.language", pl);
        }
        // G2: (re)register the Expo push token on every app start once logged in,
        // so profiles.expo_push_token is refreshed even when the setup flow (the
        // only prior call site) is skipped. Fire-and-forget — it never blocks
        // routing and logs push_register {ok, reason} for diagnosis.
        void registerPush();
        // Tester-terms (founder 2026-09-24): if this device accepted before sign-up
        // (session-less) the profile column is still null — mirror it now, once.
        if (!profile?.tester_terms_accepted_at) {
          void (async () => {
            const [ver, at] = await Promise.all([
              AsyncStorage.getItem(TESTER_TERMS_VERSION_KEY),
              AsyncStorage.getItem(TESTER_TERMS_ACCEPTED_AT_KEY),
            ]);
            if (testerTermsAccepted(ver)) {
              await supabase
                .from("profiles")
                .update({ tester_terms_accepted_at: at, tester_terms_version: ver })
                .eq("id", session.user.id);
            }
          })().catch((e) => console.warn("[index] tester-terms mirror failed", (e as Error)?.message));
        }
      }
      // Tester-terms gate comes before sign-up: a device that has not accepted the
      // current version sees the terms first, whether or not a session exists.
      const testerVer = await AsyncStorage.getItem(TESTER_TERMS_VERSION_KEY);
      if (!active) return;
      if (!testerTermsAccepted(testerVer)) return router.replace("/(setup)/tester-terms");
      // Safety words live only on the device, so read the local flag here and
      // pass it through — decideRoute stays pure.
      const hasDeviceWords = (await secureWords.get("emergency")).length > 0;
      if (!active) return;
      router.replace(decideRoute(!!session, storedLang, profile, TERMS_VERSION, hasDeviceWords));
    })();
    return () => {
      active = false;
    };
  }, []);

  // R1: paint the theme background (not the default white) so the hand-off
  // between the branded screens during routing has no white flash. First-run
  // steps bounce through "/" (language -> "/" -> next), so this bare view is
  // shown briefly on every hop; an unthemed white surface read as a jarring
  // flicker, especially on the dark palettes.
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: p.bgBase }}>
      <ActivityIndicator size="large" color={p.brand} />
    </View>
  );
}
