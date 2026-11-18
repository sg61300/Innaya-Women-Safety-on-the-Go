import { useEffect, useRef, useState } from "react";
import { View, Modal, Pressable } from "react-native";
import * as Notifications from "expo-notifications";
import { ChevronDown } from "lucide-react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { Card } from "./Card";
import { Button3D } from "./Button3D";
import { guardian } from "../services/guardian";
import i18n from "../i18n";

// Monitoring request payload carried on the push notification's data blob.
export type MonitorRequest = {
  journeyId: string;
  name: string;
  time: string;
  from: string;
  to: string;
  minutes: number;
  position?: number;
  total?: number;
};

const AUTO_DECLINE_MS = 3 * 60_000;

// Session-only guard: the id of the last request this guardian answered, so a
// cold-start (or repeated) notification tap for the same journey never re-opens
// an already-handled sheet. No persistence needed beyond the running session.
let lastAnswered: string | null = null;

function parse(data: any): MonitorRequest | null {
  if (!data || data.kind !== "monitoring_request" || !data.journeyId) return null;
  return {
    journeyId: String(data.journeyId),
    name: data.name ?? "Someone",
    time: data.time ?? "",
    from: data.from ?? "",
    to: data.to ?? "",
    minutes: Number(data.minutes ?? data.n ?? 0),
    position: data.position != null ? Number(data.position) : undefined,
    total: data.total != null ? Number(data.total) : undefined,
  };
}

// Mounted once (guardian layout). Opens on a monitoring_request notification
// tap and on cold start, and auto-declines after 3 min if untouched.
export function RequestSheet() {
  const { p, d } = useTheme();
  const [req, setReq] = useState<MonitorRequest | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const close = () => {
    clear();
    setReq(null);
    setExpanded(false);
    setError(false);
    setPending(false);
  };

  useEffect(() => {
    let mounted = true;
    const open = (r: MonitorRequest | null) => {
      // Ignore a request we already answered this session (repeated cold-start
      // response) so the sheet never re-opens for a handled journey.
      if (mounted && r && r.journeyId !== lastAnswered) setReq(r);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((resp) =>
      open(parse(resp?.notification?.request?.content?.data))
    );
    Notifications.getLastNotificationResponseAsync?.()
      .then((resp: any) => open(parse(resp?.notification?.request?.content?.data)))
      .catch(() => {});
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    timer.current = setTimeout(() => {
      lastAnswered = req.journeyId;
      guardian.respond(req.journeyId, "decline");
      Notifications.clearLastNotificationResponseAsync?.();
      close();
    }, AUTO_DECLINE_MS);
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.journeyId]);

  if (!req) return null;
  const respond = async (r: "accept" | "decline") => {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      await guardian.respond(req.journeyId, r);
    } catch {
      // POST failed (offline / 4xx): keep the sheet open so the guardian can
      // retry; do NOT let them believe they answered.
      setError(true);
      setPending(false);
      return;
    }
    lastAnswered = req.journeyId;
    Notifications.clearLastNotificationResponseAsync?.();
    close();
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={() => respond("decline")}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
        <Card testID="request-sheet" style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, gap: 14 }}>
          <Text variant="title" color="primary">
            {i18n.t("guardian.request.title")}
          </Text>
          <Text variant="body" color="muted">
            {i18n.t("guardian.request.body", { name: req.name, time: req.time, from: req.from, to: req.to, n: req.minutes })}
          </Text>
          {req.position != null && req.total != null ? (
            <Text variant="caption" color="faint" testID="request-queue">
              {i18n.t("guardian.request.queue", { position: req.position, total: req.total })}
            </Text>
          ) : null}
          <Pressable testID="request-expander" accessibilityRole="button" onPress={() => setExpanded((e) => !e)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ChevronDown size={16} color={p.brand} />
            <Text variant="bodyStrong" color={p.brand}>
              {i18n.t("guardian.request.expanderTitle")}
            </Text>
          </Pressable>
          {expanded ? (
            <Text variant="caption" color="muted" testID="request-expander-body">
              {i18n.t("guardian.request.expanderBody")}
            </Text>
          ) : null}
          <View style={{ gap: 10, marginTop: 4 }}>
            <Button3D testID="request-accept" full label={i18n.t("guardian.request.yes")} disabled={pending} onPress={() => respond("accept")} />
            <Button3D testID="request-decline" full variant="ghost" label={i18n.t("guardian.request.no")} disabled={pending} onPress={() => respond("decline")} />
          </View>
          {error ? (
            <Text variant="caption" color={p.stateDanger} testID="request-error">
              {i18n.t("guardian.request.error")}
            </Text>
          ) : null}
          <View style={{ height: 1, backgroundColor: d.card.border }} />
        </Card>
      </View>
    </Modal>
  );
}
