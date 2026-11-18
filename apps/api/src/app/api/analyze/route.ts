import { runEnsemble, type ScoreInput } from "@vaira/core";
import { requireUser } from "@/lib/auth";
import { admin } from "@/lib/supabaseAdmin";
import { logEvent } from "@/lib/events";
import { buildScorers, claudeFallbackOn, defaultBudget } from "@/lib/providers";

// One shared budget + voter set per server instance so rate limits are tracked
// across requests.
const scorers = buildScorers();
const budget = defaultBudget();
const claudeFallback = claudeFallbackOn();
// Q2b (lane F2): default the ensemble fusion deadline to 1800 ms so a single slow
// voter can never overrun the 2 s AMBER cadence (the fast phase of R49-A's adaptive
// alarm cadence). Lane F measured Mistral p95 1211 ms and Groq p95 691 ms live, both
// well inside 1800 ms, so healthy voters still fuse; only a genuinely hung provider
// (the observed 2361–3110 ms Mistral outlier) is cut. SCORER_TIMEOUT_MS overrides.
const TIMEOUT_MS = Number(process.env.SCORER_TIMEOUT_MS ?? 1800);

type AnalyzeBody = ScoreInput & { journeyId: string };

// /api/analyze only runs during active monitoring; the scorer rubric is undefined
// for IDLE/ARMED/RESOLVED, so those are rejected as bad requests.
const ANALYZE_STATES = new Set(["SAFE", "AMBER", "EMERGENCY", "CRITICAL"]);

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const body = (await req.json()) as AnalyzeBody;
    if (!body?.journeyId) return new Response("bad request", { status: 400 });
    // J2 receipt log: greppable proof a frame reached the api, with the frame size so
    // a body-limit/masking issue is visible even before scoring.
    console.log(
      "[analyze] receipt",
      JSON.stringify({
        journeyId: body.journeyId,
        state: body.state,
        frameB64Len: typeof body.maskedFrameB64 === "string" ? body.maskedFrameB64.length : 0,
      }),
    );

    // Bound the request body before any work: a masked frame is a small JPEG and
    // the transcript is 30 s of speech; anything larger is malformed or abusive.
    if (typeof body.maskedFrameB64 === "string" && body.maskedFrameB64.length > 1_000_000)
      return new Response("frame too large", { status: 413 });
    if (typeof body.transcript30s === "string" && body.transcript30s.length > 4_000)
      return new Response("transcript too large", { status: 413 });
    if (!ANALYZE_STATES.has(body.state as string))
      return new Response("bad request", { status: 400 });

    const { data: j } = await admin()
      .from("journeys")
      .select("owner_id")
      .eq("id", body.journeyId)
      .single();
    if (!j || j.owner_id !== user.id) return new Response("forbidden", { status: 403 });

    console.log("[analyze] fan-out", JSON.stringify({ state: body.state, journeyId: body.journeyId, voters: scorers.length }));
    const outcome = await runEnsemble(body, { scorers, budget, claudeFallback, timeoutMs: TIMEOUT_MS });
    console.log(
      "[analyze] ensemble",
      JSON.stringify({
        danger: outcome.danger,
        votes: outcome.votes.length,
        rulesOnly: outcome.rulesOnly,
        fallbacks: outcome.fallbacks,
      }),
    );

    // Q2a (lane F2): when no model voted, emit one greppable structured line so an
    // operator can alert on it. `fallbacks` is `id:status` per provider (plus the
    // trailing "rules-only" marker), which we split into {id, outcome}. The
    // model_call event below still carries rulesOnly+fallbacks for the audit trail.
    if (outcome.rulesOnly) {
      const providers = outcome.fallbacks
        .filter((f) => f !== "rules-only")
        .map((f) => {
          const i = f.lastIndexOf(":");
          return i >= 0 ? { id: f.slice(0, i), outcome: f.slice(i + 1) } : { id: f, outcome: "unknown" };
        });
      console.error("scorer_no_votes", JSON.stringify({ journeyId: body.journeyId, providers }));
    }

    const reasons = [...new Set(outcome.votes.flatMap((v) => v.reasons))];
    const latencyMs = outcome.votes.reduce((m, v) => Math.max(m, v.latencyMs), 0);
    await logEvent({
      journeyId: body.journeyId,
      type: "model_call",
      dangerScore: outcome.danger,
      modelReasons: reasons,
      latencyMs,
      payload: {
        votes: outcome.votes,
        fallbacks: outcome.fallbacks,
        rulesOnly: outcome.rulesOnly,
      },
    });
    // J2: model_call is the row that never appeared across b8–b13. Log the attempt
    // here; a DB failure surfaces as "[events] insert failed model_call …" from
    // logEvent, so the pair localises a silent insert failure to this line.
    console.log("[analyze] model_call logged", JSON.stringify({ journeyId: body.journeyId, danger: outcome.danger }));

    return Response.json(outcome);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[analyze]", e);
    return new Response("error", { status: 500 });
  }
}
