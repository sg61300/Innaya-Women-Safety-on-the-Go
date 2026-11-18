import { useEffect, useMemo, useState } from "react";
import { Modal } from "react-native";
import { SilentAlarmScreen } from "./SilentAlarmScreen";
import { CancelFlow } from "./CancelFlow";
import { makeCancelFlowDeps } from "../services/cancelFlowDeps";
import { useJourney } from "../store/journey";
import { supabase } from "../lib/supabase";

// ADR-043 item 3 — the wearer-facing surface for a SILENT alarm. No red, no siren,
// no loud local notification (the siren service refuses to sound in silent mode).
// It shows the calm SilentAlarmScreen and routes its visible "Not an emergency"
// button into the SAME guardian-approved CancelFlow the siren overlay uses.
// Mounted once in (user)/_layout; EmergencyOverlay stays hidden while silent.
export function SilentAlarmOverlay() {
  const rawState = useJourney((s) => s.ctx.state);
  const alarmMode = useJourney((s) => s.ctx.alarmMode);
  const journeyId = useJourney((s) => (s.journey?.id as string | undefined) ?? undefined);
  const ownerId = useJourney((s) => (s.journey?.owner_id as string | undefined) ?? undefined);
  const challengeOpen = useJourney((s) => s.challenge !== null);

  const visible = !challengeOpen && alarmMode === "silent" && (rawState === "CRITICAL" || rawState === "CANCEL_HOLD");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [guardianCount, setGuardianCount] = useState(0);
  const deps = useMemo(() => makeCancelFlowDeps(), [journeyId]);

  useEffect(() => {
    if (!visible) { setCancelOpen(false); return; }
    let alive = true;
    // Best-effort count of guardians who were told (the CRITICAL fan-out reached all).
    (async () => {
      if (!ownerId) return;
      try {
        const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("owner_id", ownerId);
        if (alive && typeof count === "number") setGuardianCount(count);
      } catch { /* count is a display nicety; leave it */ }
    })();
    return () => { alive = false; };
  }, [visible, ownerId]);

  return (
    <Modal visible={visible} transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => {}} testID="silent-alarm-overlay">
      {cancelOpen ? (
        <CancelFlow
          hasJourney={!!journeyId}
          deps={deps}
          onResolved={(v) => { if (v === "cancel") setCancelOpen(false); }}
        />
      ) : (
        <SilentAlarmScreen guardianCount={guardianCount} onNotEmergency={() => setCancelOpen(true)} />
      )}
    </Modal>
  );
}
