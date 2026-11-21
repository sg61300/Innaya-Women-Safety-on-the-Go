import { admin } from "./supabaseAdmin";
import { signGuardianToken } from "./token";
import { logEvent } from "./events";

// Browser (PWA) notifications for guardians who have no app (founder Q101, Q105).
// A guardian with an app push token is reached in the app and is skipped here.

type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
type WebPushLib = { sendNotification: (target: PushTarget, payload: string, options: unknown) => Promise<unknown> };
const webpush: WebPushLib = require("web-push");

// How long the push service keeps trying a phone that is off, and how long one send
// may hold up the fan-out. Both are easy to change here.
const TTL_SECONDS = 3600;
const SEND_TIMEOUT_MS = 5000;

function vapidDetails() {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

// Sends one notification to each of these contacts who has a saved browser
// subscription and no app push token. Tapping it opens that guardian's own
// /g/<token>, which also shows an open cancel request they were asked about.
// Never throws: a web push problem must not stop app push or email. Returns the contacts
// at least one of whose browsers took the notification, so a caller can fall back, and those
// whose browser send failed and may work later. `query` adds a guardian's own vote link, so a
// guardian no longer being asked can still use their late Safe from the notification.
export async function notifyContactsWebPush(journeyId: string, contactIds: string[], title: string, body: string, query?: (contactId: string) => string): Promise<{ sent: string[]; failed: string[] }> {
  const reached = new Set<string>();
  const failedIds = new Set<string>();
  try {
    if (!contactIds.length) return { sent: [], failed: [] };
    const vapid = vapidDetails();
    if (!vapid) {
      console.warn("[web-push] VAPID env not configured, skipped");
      return { sent: [], failed: [] };
    }
    const db = admin();
    const { data: subs, error } = await db
      .from("web_push_subscriptions")
      .select("id, contact_id, endpoint, p256dh, auth")
      .in("contact_id", contactIds);
    if (error) console.error("[web-push] subscription read failed", error.message);
    if (!subs?.length) return { sent: [], failed: [] };

    const hasApp = await contactsWithAppToken(db, [...new Set(subs.map((s: any) => s.contact_id as string))]);
    const targets = subs.filter((s: any) => !hasApp.has(s.contact_id));
    let sent = 0;
    let removed = 0;
    const failures: (number | string)[] = [];
    await Promise.all(
      targets.map(async (s: any) => {
        const payload = JSON.stringify({ title, body, url: `/g/${signGuardianToken(journeyId, s.contact_id)}${query?.(s.contact_id) ?? ""}` });
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: TTL_SECONDS, urgency: "high", timeout: SEND_TIMEOUT_MS, vapidDetails: vapid },
          );
          sent++;
          reached.add(s.contact_id);
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            // The browser dropped this subscription; it can never work again.
            await db.from("web_push_subscriptions").delete().eq("id", s.id);
            removed++;
          } else {
            failures.push(status ?? "network");
            failedIds.add(s.contact_id);
          }
        }
      }),
    );
    console.info("[web-push]", { journeyId, sent, removed, failed: failures.length });
    if (failures.length) {
      // Status codes only: the endpoint and keys stay out of the logs.
      console.error("[web-push] send failed", { journeyId, failures });
      await logEvent({ journeyId, type: "alert_failed", payload: { fanout: "web_push", failed: failures.length, failures } });
    }
  } catch (e) {
    console.error("[web-push] fan-out failed", (e as Error)?.message ?? e);
  }
  return { sent: [...reached], failed: [...failedIds].filter((id) => !reached.has(id)) };
}

async function contactsWithAppToken(db: ReturnType<typeof admin>, contactIds: string[]): Promise<Set<string>> {
  const { data: contacts } = await db.from("contacts").select("id, linked_user_id").in("id", contactIds);
  const linked = (contacts ?? []).filter((c: any) => c.linked_user_id);
  if (!linked.length) return new Set();
  const { data: profs } = await db.from("profiles").select("id, expo_push_token").in("id", linked.map((c: any) => c.linked_user_id));
  const withToken = new Set((profs ?? []).filter((p: any) => p.expo_push_token).map((p: any) => p.id));
  return new Set(linked.filter((c: any) => withToken.has(c.linked_user_id)).map((c: any) => c.id as string));
}
