import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { allowRoute, parseDirections } from "@/lib/directions";

// ADR-040 (task 14c): server-side Google Directions proxy so the device never
// holds the Maps key. One live-traffic route lookup per journey per 60 s.
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const u = new URL(req.url); const journeyId = u.searchParams.get("journeyId"), origin = u.searchParams.get("origin"), destination = u.searchParams.get("destination");
    if (!journeyId || !origin || !destination) return new Response("bad request", { status: 400 });
    // A5: only the journey owner or an active guardian may spend Directions quota on it.
    const db = admin();
    const { data: j } = await db.from("journeys").select("owner_id").eq("id", journeyId).single();
    if (!j) return new Response("not found", { status: 404 });
    if (j.owner_id !== user.id) {
      const { data: g } = await db.rpc("is_active_guardian_for", { p_journey_id: journeyId, p_user_id: user.id });
      if (!g) return new Response("forbidden", { status: 403 });
    }
    if (!allowRoute(journeyId)) return new Response("rate limited", { status: 429 });
    const key = process.env.GOOGLE_MAPS_API_KEY; if (!key) return new Response("not configured", { status: 503 });
    const g = new URL("https://maps.googleapis.com/maps/api/directions/json");
    g.searchParams.set("origin", origin); g.searchParams.set("destination", destination); g.searchParams.set("departure_time", "now"); g.searchParams.set("mode", "driving"); g.searchParams.set("key", key);
    const res = await fetch(g, { headers: { accept: "application/json" } });
    const parsed = parseDirections(await res.json());
    if (!parsed) return new Response("no route", { status: 404 });
    console.log("[route]", journeyId, parsed.durationSec, parsed.durationInTrafficSec, parsed.distanceM);
    return Response.json(parsed);
  } catch (e) { if (e instanceof Response) return e; console.error("[route]", e); return new Response("error", { status: 500 }); }
}
