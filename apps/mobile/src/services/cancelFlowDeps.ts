// ADR-043 item 5 — the real dependencies for the CancelFlow state machine.
// CancelFlow itself is pure/DI so it stays unit-testable; this factory binds the
// live password gate, the journey-word verifier, the cancel-request API, the
// selfies-bucket upload and the guardian-verdict realtime (with a 5 s poll
// fallback) to that machine. Nothing here runs in tests — they inject fakes.
import * as Crypto from "expo-crypto";
import { gates } from "./gates";
import { resolveAccountEmail } from "./appPassword";
import { runner } from "./protocolRunner";
import { post, get } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useJourney } from "../store/journey";
import type { CancelFlowDeps } from "../components/CancelFlow";
import type { CancelMethod } from "@vaira/core";

type Verdict = "cancel" | "keep" | "reraise" | "pending";
const POLL_MS = 5000;

// Surfaced by CancelFlow as "the alarm is not active" (a 409 from the route — the
// journey left an alarm state before the request landed).
export class NotCancellableError extends Error {
  constructor() {
    super("cancel request not allowed (409)");
    this.name = "NotCancellableError";
  }
}

export function makeCancelFlowDeps(): CancelFlowDeps {
  const journeyId = () => (useJourney.getState().journey?.id as string | undefined) ?? "";
  // The request id is only known after the POST, so the verdict subscription keys
  // on the journey's open request row.
  let requestId: string | null = null;

  return {
    // Step 1 — the app password (live gate + SecureStore fallback inside gates).
    // X5c: pass the gate's reason through so CancelFlow can tell a wrong password
    // from a network/service failure (the latter must not spend a try or lock).
    verifyPassword: async (pw: string) => {
      const email = await resolveAccountEmail().catch(() => "");
      return gates.verifyPassword(email, pw);
    },

    // Step 2 — the journey safe word, verified ONLY against this journey (rule 6).
    verifyWord: (w: string) => runner.verifySafeWord(w),

    // Step 3 — open the guardian cancel request. Re-apply CANCEL_REQUESTED locally
    // (the server applied it too; CANCEL_HOLD ranks below CRITICAL so the runner
    // would not otherwise adopt the de-escalation) and start the 30 s timeout.
    createRequest: async (method: CancelMethod, mediaPath?: string) => {
      try {
        const r = await post<{ requestId: string; asked: number }>("/api/cancel-request", {
          journeyId: journeyId(),
          method,
          mediaPath,
        });
        requestId = r.requestId;
        void runner.send({ type: "CANCEL_REQUESTED", method });
        return { askedCount: r.asked };
      } catch (e) {
        if (String((e as Error)?.message ?? e).includes("409")) throw new NotCancellableError();
        throw e;
      }
    },

    // The guardian verdict: Supabase realtime on the request row, plus a 5 s poll
    // fallback in case the socket drops. A kept/re-raised verdict drives the local
    // runner back to CRITICAL (GUARDIAN_SAYS_WRONG); a cancel is already applied
    // server-side and the runner adopts RESOLVED_MONITORING on its next sync.
    subscribeVerdict: (cb: (v: Verdict) => void) => {
      let done = false;
      const fire = (v: Verdict) => {
        if (done || v === "pending") return;
        done = true;
        if (v === "keep" || v === "reraise") void runner.send({ type: "GUARDIAN_SAYS_WRONG" });
        cb(v);
      };
      const jid = journeyId();
      const ch = supabase
        .channel?.(`cr:${jid}`)
        ?.on?.(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "cancel_requests", filter: `journey_id=eq.${jid}` },
          (p: { new?: { verdict?: Verdict } }) => { if (p?.new?.verdict) fire(p.new.verdict); },
        );
      ch?.subscribe?.();
      const poll = setInterval(() => {
        void (async () => {
          try {
            if (!requestId) return;
            const row = await get<{ verdict?: Verdict }>(`/api/cancel-request/${requestId}`);
            if (row?.verdict) fire(row.verdict);
          } catch { /* transient; the next tick retries */ }
        })();
      }, POLL_MS);
      return () => {
        clearInterval(poll);
        try { if (ch) supabase.removeChannel?.(ch as never); } catch { /* ignore */ }
      };
    },

    // Step 4 — the wearer's own proof. Upload under a client-generated uuid path so
    // it exists BEFORE the request is created (the route only checks the
    // cancel/<journeyId>/ prefix). CancelFlow uploads first, so a failed upload
    // never opens a medialess request.
    uploadMedia: async (localUri: string, method: "photo" | "video") => {
      const ext = method === "photo" ? "jpg" : "mp4";
      const path = `cancel/${journeyId()}/${Crypto.randomUUID()}.${ext}`;
      const blob = await (await fetch(localUri)).blob();
      const { error } = await supabase.storage
        .from("selfies")
        .upload(path, blob, { contentType: method === "photo" ? "image/jpeg" : "video/mp4" });
      if (error) throw error;
      return path;
    },
    // captureMedia omitted → CancelMediaCapture uses the live front camera.
  };
}
