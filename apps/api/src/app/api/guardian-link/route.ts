import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { signGuardianToken } from "@/lib/token";

function appBaseUrl(): string | null {
  const raw = process.env.APP_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

// Owner-only signed live link for a journey (Task 27). The active screen's
// "Share live link" button calls this, then copies `url` to the clipboard.
// The token is self-contained (see lib/token), no DB row for the share itself.
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const journeyId = new URL(req.url).searchParams.get("journeyId");
    if (!journeyId) return new Response("bad request", { status: 400 });
    const { data: j } = await admin().from("journeys").select("owner_id").eq("id", journeyId).single();
    if (!j) return new Response("not found", { status: 404 });
    if (j.owner_id !== user.id) return new Response("forbidden", { status: 403 });
    const baseUrl = appBaseUrl();
    if (!baseUrl) return new Response("not configured", { status: 503 });
    return Response.json({ url: `${baseUrl}/g/${signGuardianToken(journeyId)}` });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[guardian-link]", e);
    return new Response("error", { status: 500 });
  }
}
