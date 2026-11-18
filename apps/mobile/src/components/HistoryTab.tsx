import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { useTheme, type ChipKind } from "../theme";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { Text } from "./Text";
import { Illustration } from "./Illustration";
import { history, type Feedback } from "../services/history";
import i18n from "../i18n";

type Journey = { id: string; from_label: string | null; to_label: string | null; start_at: string; status: string };
type Alert = { id: number; ts: string; type: string; danger_score: number | null; user_feedback: string | null };

const statusChip = (status: string): ChipKind =>
  status === "resolved" ? "safe" : status === "monitoring" ? "amber" : "neutral";

// Task 34 — History tab. Lists the owner's journeys (newest first); tapping one
// loads its state_change alerts, each with 👍 / 👎 that write user_feedback via
// history.feedback and reflect the choice locally.
export function HistoryTab({ userId }: { userId: string }) {
  const { p, d } = useTheme();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = (await history.journeys(userId)) as Journey[];
        if (alive) setJourneys(rows);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const openJourney = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setAlerts([]);
    setAlertsLoading(true);
    try {
      setAlerts((await history.alerts(id)) as Alert[]);
    } finally {
      setAlertsLoading(false);
    }
  };

  const rate = async (eventId: number, v: Feedback) => {
    setAlerts((prev) => prev.map((a) => (a.id === eventId ? { ...a, user_feedback: v } : a)));
    try {
      await history.feedback(eventId, v);
    } catch {
      /* optimistic; the row stays as chosen */
    }
  };

  if (loading) return <Card><Text variant="body" color="muted">…</Text></Card>;
  if (journeys.length === 0) {
    return (
      <Card variant="raised" style={{ alignItems: "center", gap: 10 }}>
        <Illustration name="journey-plan" size={96} testID="history-empty-art" />
        <Text variant="body" color="muted" style={{ textAlign: "center" }}>{i18n.t("history.empty")}</Text>
      </Card>
    );
  }

  return (
    <View style={{ gap: 12 }} testID="history-tab">
      {journeys.map((j) => (
        <Card key={j.id} onPress={() => openJourney(j.id)} testID={`history-journey-${j.id}`}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text variant="body">{(j.from_label ?? "?") + " → " + (j.to_label ?? "?")}</Text>
              <Text variant="caption" color="muted">{new Date(j.start_at).toLocaleString()}</Text>
            </View>
            <Chip kind={statusChip(j.status)} label={i18n.t(`history.status.${j.status}`, { defaultValue: j.status })} />
          </View>

          {openId === j.id ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              {alertsLoading ? (
                <Text variant="caption" color="muted">…</Text>
              ) : alerts.length === 0 ? (
                <Text variant="caption" color="muted">{i18n.t("history.noAlerts")}</Text>
              ) : (
                alerts.map((a) => (
                  <View
                    key={a.id}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                      borderTopWidth: 1, borderTopColor: d.card.border, paddingTop: 8 }}
                  >
                    <Text variant="caption" style={{ flex: 1 }}>
                      {a.type}{a.danger_score != null ? ` · ${i18n.t("history.score")} ${a.danger_score}` : ""}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={i18n.t("history.genuine")}
                        testID={`history-genuine-${a.id}`}
                        hitSlop={8}
                        onPress={() => rate(a.id, "genuine")}
                      >
                        <Text variant="body" color={a.user_feedback === "genuine" ? p.stateSafe : "muted"}>👍</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={i18n.t("history.falseAlarm")}
                        testID={`history-false-${a.id}`}
                        hitSlop={8}
                        onPress={() => rate(a.id, "false_alarm")}
                      >
                        <Text variant="body" color={a.user_feedback === "false_alarm" ? d.sos : "muted"}>👎</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </Card>
      ))}
    </View>
  );
}
