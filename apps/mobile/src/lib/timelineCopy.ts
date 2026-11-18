import i18n from "../i18n";

// Guardian-facing one-line summary for an event row (ADR-038/039/040). Pure:
// a switch over payload.ev.type (+ kind/tier/pauseSensor/sensor). Returns null
// for rows a guardian should not see as a timeline line (e.g. raw scores).
type Row = {
  type?: string;
  at?: string;
  payload?: { ev?: { type?: string; kind?: string; tier?: number; pauseSensor?: string; sensor?: string; score?: number }; actions?: string[] };
};

// HH:MM in the device's local time zone (jest pins TZ=Asia/Kolkata).
function hhmm(at?: string): string {
  const d = at ? new Date(at) : new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function timelineCopy(row: Row): string | null {
  const ev = row.payload?.ev;
  if (!ev?.type) return null;
  switch (ev.type) {
    case "CHALLENGE_PASSED":
      return ev.pauseSensor === "cam" ? i18n.t("timeline.cameraPaused") : null;
    case "SENSOR_RESUME":
      return ev.sensor === "cam" ? i18n.t("timeline.cameraOn") : null;
    case "STATIONARY":
      return ev.tier === 2 ? i18n.t("timeline.checkinStationary") : i18n.t("timeline.stopped", { time: hhmm(row.at) });
    case "ROUTE_DEVIATION":
      return ev.kind === "away" ? i18n.t("timeline.routeAway") : i18n.t("timeline.routeDetour");
    case "MONITOR_CAP":
      return i18n.t("timeline.monitorCap");
    default:
      return null;
  }
}
