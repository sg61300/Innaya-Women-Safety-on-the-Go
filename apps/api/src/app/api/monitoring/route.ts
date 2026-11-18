import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { reconcilePlan, requestTier } from "@/lib/monitoring";
import { guardianView } from "@/lib/liveGate";
import { guardianFramePath } from "@/lib/guardianFrame";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const journeyId = new URL(req.url).searchParams.get("journeyId");
    if (!journeyId) return new Response("bad request", { status: 400 });
    const db = admin();
    const { data: allowed } = await db.rpc("is_active_guardian_for", { p_journey_id: journeyId, p_user_id: user.id });
    if (!allowed) return new Response("forbidden", { status: 403 });
    const [{ data: journey }, { data: state }, { data: location }, { data: heartbeat }, { data: frame }] = await Promise.all([
      db.from("journeys").select("from_label,to_label,status,profiles(name,phone)").eq("id", journeyId).single(),
      db.from("journey_state").select("state,changed_at").eq("journey_id", journeyId).order("changed_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("locations").select("lat,lng,ts").eq("journey_id", journeyId).order("ts", { ascending: false }).limit(1).maybeSingle(),
      db.from("heartbeats").select("battery,ts").eq("journey_id", journeyId).order("ts", { ascending: false }).limit(1).maybeSingle(),
      db.from("events").select("frame_url,payload,ts").eq("journey_id", journeyId).eq("type", "frame").order("ts", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const latestState = (state as any)?.state ?? "IDLE";
    const view = guardianView(latestState, (journey as any)?.status);
    const path = view.showFrames ? guardianFramePath(frame as any) : null;
    const signedUrl = path ? (await db.storage.from("frames").createSignedUrl(path, 300)).data?.signedUrl ?? null : null;
    return Response.json({
      journey: { from: (journey as any)?.from_label ?? null, to: (journey as any)?.to_label ?? null, name: (journey as any)?.profiles?.name ?? null, phone: (journey as any)?.profiles?.phone ?? null },
      state: latestState,
      location: location ?? null,
      heartbeat: heartbeat ?? null,
      frame: view.showFrames && signedUrl ? { url: signedUrl, ts: (frame as any).ts } : null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[monitoring:get]", e);
    return new Response("error", { status: 500 });
  }
}

// Monitoring requests, guardian responses/heartbeats, and reconciliation (Task 15).
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { action, journeyId, response } = await req.json();
    if (!journeyId) return new Response("bad request", { status: 400 });
    const db = admin();
    if (action === "request") {
      // Owner-only: pushing a monitoring request touches this journey's guardians
      // and returns its watcher plan, so the caller must own the journey (IDOR fix).
      const { data: j } = await db.from("journeys").select("owner_id").eq("id", journeyId).single();
      if (!j) return new Response("not found", { status: 404 });
      if (j.owner_id !== user.id) return new Response("forbidden", { status: 403 });
      await requestTier(journeyId, "primary");
      return Response.json(await reconcilePlan(journeyId));
    }
    if (action === "respond" || action === "heartbeat") {
      const { data: c } = await db.from("contacts").select("id").eq("linked_user_id", user.id);
      const ids = (c ?? []).map((x: any) => x.id);
      const patch =
        action === "respond"
          ? { response, responded_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }
          : { last_seen_at: new Date().toISOString() };
      await db.from("monitoring_assignments").update(patch).eq("journey_id", journeyId).in("contact_id", ids);
    }
    return Response.json(await reconcilePlan(journeyId));
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[monitoring]", e);
    return new Response("error", { status: 500 });
  }
}
