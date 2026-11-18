// Lane E3 / X5a (founder ruling 2026-09-24) — the SIMULATION variant of the
// CancelFlow deps. A practice drill must walk the SAME cancel→proof screens
// WITHOUT ever touching a guardian: no /api/cancel-request, no notifyGuardians, no
// push, no guardian selfies upload. The wearer's proof goes to their OWN account
// email via POST /api/simulate-proof (which uploads under simulation/<userId>/ and
// sends the one self-email). Password/word checks stay LOCAL only (no live sign-in
// / no server) — a drill only needs to walk the steps, not authenticate against a
// guardian service.
import * as FileSystem from "expo-file-system/legacy";
import { runner } from "./protocolRunner";
import { verifyAppPasswordLocal } from "./appPassword";
import { post } from "../lib/api";
import type { CancelFlowDeps } from "../components/CancelFlow";

export function makeSimulationCancelFlowDeps(): CancelFlowDeps {
  return {
    // Local-only app-password check (no network). No local hash yet (fresh install)
    // → null → let the drill proceed rather than dead-end the practice run.
    verifyPassword: async (pw: string) => {
      const r = await verifyAppPasswordLocal(pw).catch(() => null);
      return r === null ? true : r;
    },

    // The journey safe word, verified against the local runner only.
    verifyWord: (w: string) => runner.verifySafeWord(w),

    // A simulation NEVER opens a guardian cancel request. CancelFlow routes the sim
    // media step straight to the "sent" screen and never calls this; if anything
    // ever does, it throws so no guardian path can leak from a drill.
    createRequest: async () => {
      throw new Error("simulation must not open a guardian cancel request");
    },

    // The proof goes to the tester's OWN email through /api/simulate-proof, which
    // uploads the media server-side under simulation/<userId>/ and sends one email.
    // Resolves with the address it was sent to (shown on the "sent" screen).
    uploadMedia: async (localUri: string, method: "photo" | "video") => {
      const media = await FileSystem.readAsStringAsync(localUri, { encoding: "base64" });
      const r = await post<{ ok: boolean; sentTo: string }>("/api/simulate-proof", { kind: method, media });
      return r.sentTo;
    },
    // captureMedia omitted → CancelMediaCapture uses the live front camera.
  };
}
