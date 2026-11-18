import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { logEvent } from "@/lib/events";
import { sendEmail, escapeHtml } from "@/lib/alerts";
import { randomUUID } from "crypto";

// Lane E3 / X5a (founder ruling 2026-09-24). A SIMULATION (practice drill) must
// walk the whole cancel→proof flow WITHOUT ever contacting a guardian. This route
// takes the wearer's practice proof, stores it under simulation/<userId>/ in the
// same private bucket real cancel media uses, and emails ONE link to the CALLER'S
// OWN account email. It NEVER reads or writes cancel_requests, cancel_votes,
// alerts or guardian contacts, and NEVER sends a push. There is no path here that
// can reach a real guardian.
const KINDS = new Set(["photo", "video"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB decoded — a short proof clip, not a stress vector
const RATE_LIMIT = 5; // per user
const WINDOW_MS = 60 * 60 * 1000; // per hour
const SIGNED_TTL_S = 600; // same TTL as real cancel media (g/[token] selfies link)

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user.email) return new Response("no account email", { status: 400 });

    let body: { kind?: unknown; media?: unknown };
    try { body = await req.json(); } catch { return new Response("bad request", { status: 400 }); }
    const { kind, media } = body;
    if (typeof kind !== "string" || !KINDS.has(kind) || typeof media !== "string" || !media)
      return new Response("bad request", { status: 400 });

    // Decode base64 (tolerate a data: URL prefix). Reject empty / oversize before
    // any storage or mail work.
    const b64 = media.includes(",") ? media.slice(media.indexOf(",") + 1) : media;
    const buf = Buffer.from(b64, "base64");
    if (buf.length === 0 || buf.length > MAX_BYTES) return new Response("bad media size", { status: 400 });

    const db = admin();

    // Rate limit: max 5 per user per hour. The ledger is a table row (Vercel is
    // stateless — an in-memory map would reset every cold start).
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count } = await db
      .from("simulation_proofs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);
    if ((count ?? 0) >= RATE_LIMIT) return new Response("rate limited", { status: 429 });

    // Store under simulation/<userId>/ — NEVER cancel/<journeyId>/, so a drill
    // object can never be read back by the guardian page as real proof.
    const ext = kind === "photo" ? "jpg" : "mp4";
    const path = `simulation/${user.id}/${randomUUID()}.${ext}`;
    const { error: upErr } = await db.storage
      .from("selfies")
      .upload(path, buf, { contentType: kind === "photo" ? "image/jpeg" : "video/mp4" });
    if (upErr) { console.error("[simulate-proof] upload failed", upErr.message); return new Response("upload failed", { status: 502 }); }

    const { data: signed } = await db.storage.from("selfies").createSignedUrl(path, SIGNED_TTL_S);
    const link = signed?.signedUrl ?? null;

    // ONE email, to the caller's OWN account email. No guardian is contacted.
    const to = user.email;
    const html =
      `<p>This was a <strong>practice run</strong> in INNAYA. No guardian was contacted.</p>` +
      `<p>Your practice proof (${escapeHtml(kind)}) — the link is valid for ${Math.round(SIGNED_TTL_S / 60)} minutes:</p>` +
      (link ? `<p><a href="${escapeHtml(link)}">View your practice proof</a></p>` : `<p>(the media link could not be generated)</p>`) +
      `<p>In a real alarm this proof would be sent to your guardians, not to you.</p>` +
      `<p style="color:#888">This went to ${escapeHtml(to)} because it was a simulation.</p>`;
    await sendEmail([to], "INNAYA simulation: your proof", html);

    // Record the send (this row is also the rate-limit ledger).
    await db.from("simulation_proofs").insert({ user_id: user.id, media_path: path });
    await logEvent({ journeyId: null, type: "simulation_proof_sent", payload: { kind, path } });

    return Response.json({ ok: true, sentTo: to });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[simulate-proof]", e);
    return new Response("error", { status: 500 });
  }
}
