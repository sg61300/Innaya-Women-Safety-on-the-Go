import { useEffect, useState } from "react";
import type { ProtocolState } from "@vaira/core";
import type { ChipKind } from "../theme";
import { Chip } from "./Chip";
import i18n from "../i18n";

export type StatusChipState = ProtocolState | "idle" | "countdown";

// state → chip kind + i18n key. "idle" and core "IDLE" both read "Not travelling".
const MAP: Record<string, { kind: ChipKind; key: string }> = {
  idle: { kind: "neutral", key: "status.notTravelling" },
  IDLE: { kind: "neutral", key: "status.notTravelling" },
  ARMED: { kind: "brand", key: "status.armed" },
  SAFE: { kind: "safe", key: "status.safe" },
  AMBER: { kind: "amber", key: "status.amber" },
  LATE_CHECK: { kind: "amber", key: "status.amber" },
  EMERGENCY: { kind: "danger", key: "status.emergency" },
  CRITICAL: { kind: "critical", key: "status.critical" },
  CANCEL_HOLD: { kind: "critical", key: "status.critical" },
  RESOLVED_MONITORING: { kind: "amber", key: "status.resolvedMonitoring" },
  RESOLVED: { kind: "safe", key: "status.resolved" },
};

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function StatusChip({ state, startAt }: { state: StatusChipState; startAt?: number }) {
  // Re-render every second only while counting down; other states are static.
  const [, tick] = useState(0);
  useEffect(() => {
    if (state !== "countdown") return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  if (state === "countdown") {
    const label = i18n.t("status.countdown", { time: mmss((startAt ?? Date.now()) - Date.now()) });
    return <Chip testID="status-chip" kind="brand" label={label} dot />;
  }
  const m = MAP[state] ?? MAP.idle;
  return <Chip testID="status-chip" kind={m.kind} label={i18n.t(m.key)} dot />;
}
