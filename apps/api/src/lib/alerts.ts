import { admin } from "./supabaseAdmin";
import { signGuardianToken } from "./token";
import { logEvent } from "./events";
import type { ProtocolState } from "@vaira/core";

type MailTransport = { sendMail: (message: { from: string; to: string[]; subject: string; html: string }) => Promise<unknown> };
const nodemailer: { createTransport: (options: unknown) => MailTransport } = require("nodemailer");
const GUARDIAN_SENDER = (process.env.GUARDIAN_SENDER ?? "support@example.com").trim().toLowerCase();

// R43/T2: the loud-override alarm channel id, mirrors ALARM_CHANNEL_ID in the
// mobile app's src/lib/permissions.ts (the api can't import a mobile module, so
// the value is duplicated here; keep the two in sync). The -2 id is the FRESH
// DnD-bypassing channel the phone creates once notification-policy access is held;
// "vaira-alarm" is the fallback channel that always exists. A guardian's siren push
// therefore goes to vaira-alarm-2 when loud_override is on and falls back otherwise.
const ALARM_CHANNEL_ID = "vaira-alarm-2";
const alarmChannelFor = (loudOverride: boolean) => (loudOverride ? ALARM_CHANNEL_ID : "vaira-alarm");

// Escape the five HTML-significant characters so user-typed text (place labels,
// a contact name) can never inject markup/attributes into a guardian email body.
export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Expo push fan-out (R9: Expo push API, no Firebase key required).
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  opts?: { channelId?: string; sound?: string },
) {
  if (!tokens.length) return;
  const channelId = opts?.channelId ?? "vaira-alerts";
  const sound = opts?.sound ?? "default";
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      tokens.map((to) => ({ to, title, body, data, priority: "high", channelId, sound })),
    ),
  });
}

export async function sendEmail(to: string[], subject: string, html: string) {
  if (!to.length) return;
  const user = (process.env.GMAIL_SMTP_USER ?? GUARDIAN_SENDER).trim().toLowerCase();
  const password = process.env.GMAIL_SMTP_PASS ?? process.env.SMTP_PASS;
  if (user !== GUARDIAN_SENDER) throw new Error(`GMAIL_SMTP_USER must be ${GUARDIAN_SENDER}`);
  if (!password) throw new Error("GMAIL_SMTP_PASS is not configured");
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GUARDIAN_SENDER, pass: password },
  });
  await transport.sendMail({ from: `INNAYA <${GUARDIAN_SENDER}>`, to, subject, html });
}

// Notify a traveller's guardians on a state change. AMBER pushes only the active
// (assigned) watchers; EMERGENCY/CRITICAL reach every contact. Each recipient
// gets a push (linked app users) or an email with a signed live-status link, and
// an `alerts` row is written for the audit log.
export async function notifyGuardians(journeyId: string, state: ProtocolState, title: string, body: string) {
  const db = admin();
  const { data: j } = await db.from("journeys").select("owner_id, from_label, to_label").eq("id", journeyId).single();
  if (!j) return;
  const { data: contacts } = await db.from("contacts").select("id, email, linked_user_id, tier").eq("owner_id", j.owner_id);
  const all = state === "CRITICAL" || state === "EMERGENCY";
  const { data: active } = await db.from("monitoring_assignments").select("contact_id").eq("journey_id", journeyId).eq("active", true);
  const activeIds = new Set((active ?? []).map((a: any) => a.contact_id));
  const targets = (contacts ?? []).filter((c: any) => all || activeIds.has(c.id));
  const linked = targets.map((c: any) => c.linked_user_id).filter(Boolean) as string[];
  const { data: profs } = linked.length
    ? await db.from("profiles").select("expo_push_token, loud_override").in("id", linked)
    : { data: [] as { expo_push_token: string | null; loud_override: boolean | null }[] };
  // R43: in EMERGENCY/CRITICAL, guardians who opted into loud override get the
  // high-priority vaira-alarm channel + siren; everyone else keeps the default.
  const withTok = (profs ?? []).filter((p: any) => p.expo_push_token);
  if (state === "EMERGENCY" || state === "CRITICAL") {
    const loud = withTok.filter((p: any) => p.loud_override).map((p: any) => p.expo_push_token) as string[];
    const normal = withTok.filter((p: any) => !p.loud_override).map((p: any) => p.expo_push_token) as string[];
    await sendPush(loud, title, body, { journeyId, state }, { channelId: alarmChannelFor(true), sound: "siren.mp3" });
    await sendPush(normal, title, body, { journeyId, state });
  } else {
    await sendPush(withTok.map((p: any) => p.expo_push_token) as string[], title, body, { journeyId, state });
  }
  // I10: each guardian gets their own link (token carries their contactId) so the
  // ordinary status link can also show the Safe / Not safe vote card when a cancel
  // request is open. One email per recipient — a shared link cannot name a contact.
  for (const c of targets) {
    if (!c.email) continue;
    const link = `${process.env.APP_BASE_URL}/g/${signGuardianToken(journeyId, c.id)}`;
    await sendEmail([c.email], title, `<p>${body}</p><p>${j.from_label} → ${j.to_label}</p><p><a href="${link}">Open live status</a></p>`);
  }
  for (const c of targets)
    await db.from("alerts").insert({ journey_id: journeyId, recipient: c.id, channel: c.linked_user_id ? "push" : "email", state });
}

// Notify nearby responders (Q7): all app users with a push token whose last known
// location is within 100 m of the traveller, excluding the traveller. The push
// carries only an approximate position; exact location follows an "I can help" tap.
export async function notifyNearby(journeyId: string): Promise<string[]> {
  const db = admin();
  // F2: `nearby_responders` (RPC, Task 2 / migration 0002_functions.sql) may be
  // absent or fail on a live CRITICAL. Fail soft so /api/journey-state still
  // returns 200 after the state write + guardian fan-out.
  let data: any[];
  try {
    const res = await db.rpc("nearby_responders", { p_journey_id: journeyId, p_radius_m: 100 });
    if (res.error) throw res.error;
    data = res.data ?? [];
  } catch (e) {
    console.error("[alerts] nearby_responders unavailable", (e as any)?.message ?? e);
    await logEvent({ journeyId, type: "alert_failed", payload: { fanout: "nearby", error: (e as any)?.message ?? String(e) } });
    return [];
  }
  const tokens = data.map((r: any) => r.expo_push_token).filter(Boolean) as string[];
  await sendPush(tokens, "Someone near you may need help", "An INNAYA user within 100 m is in danger. Open to see approximate location.", {
    journeyId,
    kind: "nearby",
  });
  for (const r of data)
    await db.from("alerts").insert({ journey_id: journeyId, recipient: r.user_id, channel: "nearby", state: "CRITICAL" });
  return tokens;
}
