import { useEffect, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { Info, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Text } from "./Text";
import i18n from "../i18n";
import { useJourney } from "../store/journey";
import "../services/cancelWatch"; // registers the watch that keeps a waiting cancel alive

export const STATUS_BOX_MS = 3000;

// Founder Q120, Q121: while a guardian cancel is waiting her screen is normal, with a small icon
// at a corner. A box with the status shows, goes after 3 s or by its cross, and the icon stays;
// tapping the icon shows it again. When a guardian approves, the icon goes and a box saying so
// opens at that same moment, for 3 s or until its cross. No sound, no system notification. The
// wording never says an alarm is running. Plainest look on purpose; the owner judges on device.
export function CancelWaitingNotice() {
  const { p } = useTheme();
  const insets = useSafeAreaInsets();
  const waiting = useJourney((s) => !!s.ctx.cancelWaiting);
  const offline = useJourney((s) => s.cancelOffline);
  const noGuardian = useJourney((s) => s.cancelNoGuardian);
  const approved = useJourney((s) => s.cancelApproved);
  // Founder Q116: after the emergency word nothing on her screen changes.
  const quiet = useJourney((s) => !!s.ctx.quietAlarm);
  const active = waiting || quiet;
  const message = approved ? "cancelWait.approved" : quiet ? "cancelWait.checking" : offline ? "cancelWait.offline" : noGuardian ? "cancelWait.noGuardian" : "cancelWait.checking";
  const [open, setOpen] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener?.("change", setAppState);
    return () => sub?.remove?.();
  }, []);
  // Whenever there is something new to say. The icon's tap reopens it below.
  useEffect(() => {
    if (active || approved) setOpen(true);
  }, [active, approved, message]);
  const close = () => {
    setOpen(false);
    if (approved) useJourney.getState().set({ cancelApproved: false });
  };
  // The 3 s count only while she can see it: with the app in the background it waits for her.
  useEffect(() => {
    if (!open || (!active && !approved) || appState === "background") return;
    const t = setTimeout(close, STATUS_BOX_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, approved, message, appState]);

  if (!active && !approved) return null;
  const top = insets.top + 8;
  return (
    <View testID="cancel-waiting-notice" pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}>
      {!approved && (
        <Pressable
          testID="cancel-status-icon"
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={i18n.t(message)}
          style={{ position: "absolute", top, right: 12, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: p.brandSoft }}
        >
          <Info size={22} color={p.text} />
        </Pressable>
      )}
      {open && (
        <View
          testID="cancel-status-box"
          style={{ position: "absolute", top: approved ? top : top + 52, right: 12, left: 56, flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 14, backgroundColor: p.brandSoft }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="body" testID="cancel-waiting-text">{i18n.t(message)}</Text>
          </View>
          <Pressable testID="cancel-status-close" onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel={i18n.t("consent.close")}>
            <X size={20} color={p.text} />
          </Pressable>
        </View>
      )}
    </View>
  );
}
