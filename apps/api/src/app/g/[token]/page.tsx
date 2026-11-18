import React from "react";
import { verifyGuardianToken, verifyCancelVoteToken, signCancelVoteToken } from "@/lib/token";
import { admin } from "@/lib/supabaseAdmin";
import { guardianView } from "@/lib/liveGate";
import { guardianFramePath } from "@/lib/guardianFrame";
import { GuardianStatus, LinkExpired, type GuardianData } from "./GuardianStatus";
import { CancelRequestCard } from "./CancelRequestCard";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// A guardian's live link is private; keep it out of search regardless of the
// root layout's default (founder ruling 2026-09-24 campaign). Belt-and-braces
// with the X-Robots-Tag header and robots.txt Disallow: /g/.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function GuardianPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ cr?: string; vt?: string }> }) {
  const { token } = await params;
  const { cr, vt } = await searchParams;
  const guardian = verifyGuardianToken(token);
  if (!guardian) return <LinkExpired />;
  const { journeyId, contactId } = guardian;

  const db = admin();
  const [{ data: j }, { data: history }, { data: loc }, { data: hb }, { data: frames }] = await Promise.all([
    db.from("journeys").select("from_label,to_label,owner_id,status,alarm_mode,profiles(name,phone)").eq("id", journeyId).single(),
    db.from("journey_state").select("state,changed_at").eq("journey_id", journeyId).order("changed_at", { ascending: false }).limit(20),
    db.from("locations").select("lat,lng,ts").eq("journey_id", journeyId).order("ts", { ascending: false }).limit(1).maybeSingle(),
    db.from("heartbeats").select("ts,battery").eq("journey_id", journeyId).order("ts", { ascending: false }).limit(1).maybeSingle(),
    db.from("events").select("frame_url,payload,ts").eq("journey_id", journeyId).eq("type", "frame").order("ts", { ascending: false }).limit(4),
  ]);

  const state = (history?.[0]?.state as string) ?? "IDLE";
  const status = (j as any)?.status as string | undefined;
  const view = guardianView(state, status);
  const profile = (j as any)?.profiles ?? {};

  // ADR-039 §3 (task 14b): masked frames reach guardians only during an alarm.
  const frameCandidates = view.showFrames && frames?.length ? (frames as any[]).filter((f) => !!guardianFramePath(f)) : [];
  const signed = view.showFrames && frameCandidates.length
    ? (
        await Promise.all(
          frameCandidates.map(async (f) => {
            const path = guardianFramePath(f);
            if (!path) return null;
            return { url: (await db.storage.from("frames").createSignedUrl(path, 900)).data?.signedUrl ?? null, ts: f.ts };
          },
          ),
        )
      ).filter((x): x is { url: string; ts: string } => !!x?.url)
    : [];

  // Only a referrer-restricted key is suitable for the client-facing iframe.
  // Only the referrer-restricted embed key may cross into rendered HTML. The
  // server API key must never be exposed to a guardian browser.
  const mapKey = process.env.GOOGLE_MAPS_EMBED_KEY;

  const data: GuardianData = {
    name: (profile.name as string | undefined)?.trim().split(/\s+/)[0] || "She",
    phone: (profile.phone as string | undefined)?.trim() || null,
    fromLabel: (j as any)?.from_label ?? null,
    toLabel: (j as any)?.to_label ?? null,
    state,
    archived: status === "expired" || status === "done",
    live: view.showLive,
    loc: loc ? { lat: loc.lat, lng: loc.lng, ts: loc.ts } : null,
    battery: typeof hb?.battery === "number" ? hb.battery : null,
    lastContactTs: hb?.ts ?? null,
    frames: signed,
    frameError: view.showFrames && frameCandidates.length > 0 && signed.length < frameCandidates.length,
    history: (history ?? []).map((r: any) => ({ state: r.state, changedAt: r.changed_at })),
    mapEmbedSrc: loc && mapKey ? `https://www.google.com/maps/embed/api/place?key=${mapKey}&q=${loc.lat},${loc.lng}&zoom=16` : null,
    mapLink: loc ? `https://maps.google.com/?q=${loc.lat},${loc.lng}` : null,
  };

  // ADR-043: silent badge + the open cancel-request card (only for the guardian
  // whose per-guardian vote token is in the link). Media is signed for 10 min.
  const silent = (j as any)?.alarm_mode === "silent";

  // Build the card props for a cancel_requests row. `readOnly` renders the card
  // without vote buttons (a journey-only legacy link that cannot attribute a vote).
  const cardFor = async (
    row: any,
    voteToken: string,
    readOnly: boolean,
  ): Promise<React.ComponentProps<typeof CancelRequestCard>> => {
    const mediaUrl = row.media_path
      ? (await db.storage.from("selfies").createSignedUrl(row.media_path as string, 600)).data?.signedUrl ?? null
      : null;
    return {
      requestId: row.id as string,
      method: row.method as "word" | "photo" | "video",
      mediaUrl,
      voteToken,
      resolved: !!row.resolved_at,
      verdict: (row.verdict as string | null) ?? null,
      readOnly,
    };
  };

  let cancel: React.ComponentProps<typeof CancelRequestCard> | null = null;
  if (cr && vt) {
    // Explicit cancel-request link (sent at request time). May show a resolved verdict.
    const tok = verifyCancelVoteToken(vt);
    if (tok && tok.requestId === cr) {
      const { data: reqRow } = await db
        .from("cancel_requests")
        .select("id, journey_id, method, media_path, asked_contact_ids, verdict, resolved_at")
        .eq("id", cr)
        .single();
      if (reqRow && reqRow.journey_id === journeyId && (reqRow.asked_contact_ids as string[]).includes(tok.contactId))
        cancel = await cardFor(reqRow, vt, false);
    }
  } else {
    // Any guardian link: show the open cancel request for this journey. Newest
    // unresolved row wins (order by created_at desc). A per-contact token whose
    // contactId is in asked_contact_ids gets a server-minted vote token and the
    // live vote buttons; a journey-only (legacy) link gets the card read-only.
    const { data: openReq } = await db
      .from("cancel_requests")
      .select("id, journey_id, method, media_path, asked_contact_ids, verdict, resolved_at")
      .eq("journey_id", journeyId)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openReq) {
      const asked = (openReq.asked_contact_ids as string[]) ?? [];
      if (contactId && asked.includes(contactId))
        cancel = await cardFor(openReq, signCancelVoteToken(openReq.id as string, contactId), false);
      else if (!contactId)
        cancel = await cardFor(openReq, "", true);
    }
  }

  // ADR-043 I10: self-refresh while an alarm is live so the open cancel-request
  // card appears (and clears when resolved) without a manual reload.
  const liveAlarm = state === "EMERGENCY" || state === "CRITICAL" || state === "CANCEL_HOLD";

  return (
    <>
      {liveAlarm && <meta httpEquiv="refresh" content="15" />}
      {silent && (
        <div style={{ background: "#1f2937", color: "#e5e7eb", padding: "8px 16px", font: "600 14px system-ui", textAlign: "center" }}>
          Silent alert — no siren on her phone. Her location, frames and audio are live for you.
        </div>
      )}
      {cancel && <CancelRequestCard {...cancel} />}
      <GuardianStatus data={data} />
    </>
  );
}
