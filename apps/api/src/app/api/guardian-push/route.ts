import { z } from "zod";
import { admin } from "@/lib/supabaseAdmin";
import { verifyGuardianToken } from "@/lib/token";

// The server later POSTs to the saved endpoint, so only real browser push services
// are accepted: a link holder cannot point our server at another address.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
const isPushService = (endpoint: string) => {
  const url = new URL(endpoint);
  return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
};

const Body = z.object({
  token: z.string().min(1).max(2048),
  subscription: z.object({
    endpoint: z.string().url().max(2048).refine(isPushService),
    keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
  }),
});

// Saves a guardian's browser subscription against the contact inside their signed
// link token. The contact comes only from the token, never from the request body.
export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const guardian = verifyGuardianToken(parsed.token);
  if (!guardian) return new Response("link expired", { status: 401 });
  // A journey-only link cannot say which guardian this is.
  if (!guardian.contactId) return new Response("forbidden", { status: 403 });

  const { endpoint, keys } = parsed.subscription;
  const { error } = await admin()
    .from("web_push_subscriptions")
    .upsert({ contact_id: guardian.contactId, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "contact_id,endpoint" });
  if (error) {
    console.error("[guardian-push] save failed", error.message);
    return new Response("error", { status: 500 });
  }
  return new Response(null, { status: 204 });
}
