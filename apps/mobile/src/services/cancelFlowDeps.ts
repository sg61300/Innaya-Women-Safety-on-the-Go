// ADR-043 item 5 — the real dependencies for the CancelFlow state machine.
// CancelFlow itself is pure/DI so it stays unit-testable; this factory binds the
// live password gate, the journey-word verifier, the cancel-request API and the
// selfies-bucket upload to that machine (cancelWatch owns the guardian verdict). Nothing here runs in tests — they inject fakes.
import * as Crypto from "expo-crypto";
import { gates } from "./gates";
import { resolveAccountEmail } from "./appPassword";
import { runner } from "./protocolRunner";
import { cancelOfflineMarker } from "./cancelOfflineMarker";
import { eventOutbox } from "./eventOutbox";
import { post } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useJourney } from "../store/journey";
import type { CancelFlowDeps } from "../components/CancelFlow";
import type { CancelMethod } from "@vaira/core";

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

    // Step 3 — open the guardian cancel request, then mark it locally: the alarm stays
    // CRITICAL, the siren holds and her screen goes normal. No network on the word path
    // (founder Q78, Q93): the same local state with the honest message; cancelWatch keeps
    // retrying until online. The photo/video path offline is unchanged.
    createRequest: async (method: CancelMethod, mediaPath?: string) => {
      try {
        // What raised this alarm has not reached the server yet: it goes first, in order.
        if (method === "word" && (await eventOutbox.pending()) > 0) throw new Error("earlier events still to deliver");
        const r = await post<{ requestId: string; asked: number }>("/api/cancel-request", {
          journeyId: journeyId(),
          method,
          mediaPath,
          alarmMode: useJourney.getState().ctx.alarmMode,
        });
        if (Array.isArray(r.asked) && r.asked.length === 0) useJourney.getState().set({ cancelNoGuardian: true });
        void runner.send({ type: "CANCEL_REQUESTED", method });
        return { askedCount: r.asked };
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (msg.includes("409")) throw new NotCancellableError();
        const isHttpError = /\s\d{3}$/.test(msg); // lib/api throws "<path> <status>"
        if (method !== "word" || isHttpError) throw e;
        useJourney.getState().set({ cancelOffline: true });
        // ctx, not the journey row: the row can still hold the mode from before the alarm.
        const { journey, ctx } = useJourney.getState();
        await cancelOfflineMarker.save({ id: journeyId(), owner_id: journey?.owner_id, alarm_mode: ctx.alarmMode });
        await eventOutbox.ensureCancel(journeyId(), ctx.alarmMode);
        void runner.send({ type: "CANCEL_REQUESTED", method });
        return { askedCount: 0 };
      }
    },

    // Step 4 — the wearer's own proof. Upload under a client-generated uuid path so
    // it exists BEFORE the request is created (the route checks the
    // <uid>/cancel/<journeyId>/ prefix). CancelFlow uploads first, so a failed upload
    // never opens a medialess request. Fix AB (founder Q79): the path starts with her
    // own user id because the selfies insert policy (0019 selfies_owner_insert) only
    // allows folder 1 = auth.uid(); the old cancel/<journeyId>/ path was refused.
    uploadMedia: async (localUri: string, method: "photo" | "video") => {
      const ext = method === "photo" ? "jpg" : "mp4";
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) throw new Error("cancel proof upload: no signed-in user");
      const path = `${uid}/cancel/${journeyId()}/${Crypto.randomUUID()}.${ext}`;
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
