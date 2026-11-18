// Task 32 — practice-mode safety drill. Drives the FROZEN protocol runner
// (protocolRunner.ts) with runner.setPractice(true) so every guardian-facing
// side effect (location, siren, camera, server post, real alerts) is suppressed:
// the drill exercises the full state chain locally only. Never touches the
// runner internals — only its public API (setPractice, send, onChallengeResolved,
// stop). See s12 addendum: the runner is frozen.
import type { ProtocolEvent } from "@vaira/core";
import { runner } from "./protocolRunner";
import { useJourney } from "../store/journey";

// Scripted journey: arm → monitor → a score-1 nudge (AMBER) → the emergency
// keyword (CRITICAL). Offsets in ms from drill start; the score gate uses 4000
// (the moment the challenge-worthy signal appears) as the answer clock zero.
export const drillScript: { at: number; ev: ProtocolEvent }[] = [
  { at: 0, ev: { type: "ARM" } },
  { at: 1000, ev: { type: "MONITOR_START" } },
  { at: 4000, ev: { type: "SCORE", score: 1, reasons: ["isolated_location"] } },
  { at: 12000, ev: { type: "KEYWORD", kind: "emergency" } },
];

// 0-100: half for answering the check-in within 5 s, half for saying the
// emergency safe word. Each half is independent so partial practice still scores.
export const drillScore = (a: { answeredChallengeMs: number; saidEmergencyWord: boolean }) =>
  (a.answeredChallengeMs <= 5000 ? 50 : 0) + (a.saidEmergencyWord ? 50 : 0);

export const simulation = {
  // Runs the whole drill. onStep(i) fires as each scripted event is sent;
  // onDone(score) fires after the run window closes and the runner is stopped
  // and taken out of practice mode. Total window is 20 s (8 s after the last
  // scripted event) to leave room to answer the check-in aloud.
  drill(onStep: (i: number) => void, onDone: (score: number) => void) {
    // F1 (safety, CRITICAL): the runner is the ONE shared instance that also
    // runs a real journey. Driving a drill through it mid-journey would silence
    // real side effects for 20 s and then stop() the real journey. Refuse unless
    // the journey machine is IDLE. Returns false so the caller knows it refused.
    if (useJourney.getState().ctx.state !== "IDLE") return false;
    runner.setPractice(true);
    const started = Date.now();
    let answeredAt = 0;
    let said = false;

    const timers = drillScript.map((s, i) =>
      setTimeout(async () => {
        onStep(i);
        await runner.send(s.ev);
        if (s.ev.type === "KEYWORD") said = true;
      }, s.at)
    );

    const unsub = runner.onChallengeResolved(() => {
      answeredAt = Date.now();
    });

    setTimeout(async () => {
      timers.forEach(clearTimeout);
      unsub();
      await runner.stop();
      // Drill-fix (Option A): stop() tears down side effects but leaves the journey
      // store's ctx at its drill value (e.g. CRITICAL), so the full-screen
      // EmergencyOverlay — which renders purely off ctx.state — would stay up after
      // the window. reset() returns ctx to IDLE and clears the challenge so the
      // alert/check-in screens unmount. Order matters: reset FIRST (practice still
      // TRUE), then setPractice(false), so there is never a frame where the emergency
      // UI is visible while practice is off (its cancel flow would otherwise bind to
      // the REAL guardian deps). The drill only runs from IDLE (guard above) and
      // never creates a journey, so reset clears drill state only.
      useJourney.getState().reset();
      runner.setPractice(false);
      onDone(
        drillScore({
          answeredChallengeMs: answeredAt ? answeredAt - started - 4000 : 9999,
          saidEmergencyWord: said,
        })
      );
    }, 20000);
    return true;
  },
};
