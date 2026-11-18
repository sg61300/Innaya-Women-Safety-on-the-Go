import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { View } from "react-native";
import * as Notifications from "expo-notifications";
import { AppHeader } from "../../src/components/AppHeader";
import { FooterNav } from "../../src/components/FooterNav";
import { RequestSheet } from "../../src/components/RequestSheet";

export default function GuardianLayout() {
  const router = useRouter();

  // ADR-043: a "cancel_request" push opens the confirm screen, which forwards to
  // the guardian web vote page via its per-guardian link. The legacy ADR-014
  // "cancel_attempt" push (now unused — the route is retired) still opens the
  // 360° confirm screen if one is ever delivered. Same listener + cold-start
  // pattern as RequestSheet.
  useEffect(() => {
    let mounted = true;
    const open = (data: any) => {
      if (!mounted) return;
      if (data?.kind === "cancel_request" && data.journeyId)
        router.push({ pathname: "/(guardian)/confirm-safe", params: { journeyId: String(data.journeyId), requestId: data.requestId ? String(data.requestId) : "", link: data.link ? String(data.link) : "" } });
      else if (data?.kind === "cancel_attempt" && data.journeyId)
        router.push({ pathname: "/(guardian)/confirm-safe", params: { journeyId: String(data.journeyId) } });
    };
    const sub = Notifications.addNotificationResponseReceivedListener((resp) =>
      open(resp?.notification?.request?.content?.data)
    );
    Notifications.getLastNotificationResponseAsync?.()
      .then((resp: any) => open(resp?.notification?.request?.content?.data))
      .catch(() => {});
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, [router]);

  return (
    <View style={{ flex: 1 }}>
      {/* F2: sticky brand header above the tab navigator; owns the top safe area. */}
      <AppHeader />
      <Tabs
        screenOptions={{ headerShown: false }}
        // The raised SOS button routes to the guardian SOS screen, which resolves
        // which trustee to raise for and runs the confirm + patch-in flow.
        tabBar={(props) => <FooterNav {...props} role="guardian" onSos={() => router.navigate("/(guardian)/sos")} />}
      >
        <Tabs.Screen name="trustees" options={{ title: "Trustees" }} />
        <Tabs.Screen name="sos" options={{ title: "SOS" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        {/* Detail route reached from a trustee card — not a footer tab. */}
        <Tabs.Screen name="monitor/[journeyId]" options={{ href: null }} />
        {/* ADR-014 confirm screen, opened from a cancel_attempt push — not a footer tab. */}
        <Tabs.Screen name="confirm-safe" options={{ href: null }} />
      </Tabs>
      <RequestSheet />
    </View>
  );
}
