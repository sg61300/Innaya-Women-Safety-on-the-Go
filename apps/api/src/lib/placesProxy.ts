import { requireUser } from "./auth";

// The Android-restricted Maps key is rejected by the Places HTTP APIs (s06), so the
// phone proxies From/To search through the api using the server-only
// GOOGLE_MAPS_API_KEY. Per-user rate limit: 30 requests / 60 s (amendment 22).
const WINDOW_MS = 60_000;
const LIMIT = 30;
const hits = new Map<string, number[]>();

export function allow(userId: string, now = Date.now()): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

// Forwards the request's query string to a Google Places endpoint with the
// server key injected (client-supplied `key` is ignored) and returns the JSON.
export async function proxyPlaces(req: Request, googleUrl: string): Promise<Response> {
  try {
    const user = await requireUser(req);
    if (!allow(user.id)) return new Response("rate limited", { status: 429 });
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return new Response("not configured", { status: 503 });
    const inUrl = new URL(req.url);
    const out = new URL(googleUrl);
    inUrl.searchParams.forEach((v, k) => {
      if (k !== "key") out.searchParams.set(k, v);
    });
    out.searchParams.set("key", key);
    const res = await fetch(out, { headers: { accept: "application/json" } });
    const bodyText = await res.text();
    return new Response(bodyText, { status: res.status, headers: { "content-type": "application/json" } });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[places]", e);
    return new Response("error", { status: 500 });
  }
}
