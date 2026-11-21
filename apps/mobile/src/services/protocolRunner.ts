// Task 27 + Tasks/07 Task 12 — the on-device protocol runner (session 12, written by the orchestrator).
//
// Authority model (Tasks/02 Task 27): the phone applies the @vaira/core `transition`
// first — it owns the 3 s speaker prompt and the 5 s CRITICAL deadline — then posts
// the same event to /api/journey-state. A higher server state is adopted; server
// actions the phone has not already run are run once (deduplicated per event).
//
// Every side effect lives in `effect()`. Timers: challenge speak/critical, arrival
// prompt (5 min), reconfirm (5 min), arm (start_at − 10 min), camera-pause nudge
// (15 min interval, ADR-038). Sends are serialised so a timer firing mid-await can
// never interleave two transitions.
import {
  transition,
  challengeDeadlines,
  reconfirmDue,
  lateDue,
  arrivalDue,
  fuseScore,
  matchKeyword,
  haversineM,
  initialContext,
  RECONFIRM_MS,
  SOS_SIREN_DELAY_MS,
  type ProtocolEvent,
  type Action,
  type DangerScore,
  type ProtocolState,
} from "@vaira/core";
import { Linking } from "react-native";
import { useJourney, type Challenge, type ChallengeUiKind } from "../store/journey";
import { post } from "../lib/api";
import { events } from "../lib/events";
import i18n from "../i18n";
import { eventOutbox, isFinalRefusal } from "./eventOutbox";
import { cancelOfflineMarker } from "./cancelOfflineMarker";
import type { location as LocationSvc } from "./location";
import type { camera as CameraSvc } from "./camera";
import type { siren as SirenSvc } from "./siren";
import type { secureWords as SecureWordsSvc } from "./secureWords";
import type { frameLoop as FrameLoopSvc } from "./frameLoop";
import type { feeds as FeedsSvc } from "./feeds";
import type { cancelFlow as CancelFlowSvc } from "./cancelFlow";

// Effect modules are resolved lazily: several of them load native modules
// (audio, camera, volume, haptics) that must not be pulled in just because a
// screen imports the runner. jest.mock still intercepts these requires.
/* eslint-disable @typescript-eslint/no-require-imports */
const svc = {
  get location(): typeof LocationSvc { return require("./location").location; },
  get camera(): typeof CameraSvc { return require("./camera").camera; },
  get siren(): typeof SirenSvc { return require("./siren").siren; },
  get secureWords(): typeof SecureWordsSvc { return require("./secureWords").secureWords; },
  get frameLoop(): typeof FrameLoopSvc { return require("./frameLoop").frameLoop; },
  get haptics(): typeof import("expo-haptics") { return require("expo-haptics"); },
  get feeds(): typeof FeedsSvc { return require("./feeds").feeds; }, // stationary + route feeds (Tasks/07 Task 9)
  get cancelFlow(): typeof CancelFlowSvc { return require("./cancelFlow").cancelFlow; }, // ADR-014 holds + guardian call (Task 29b)
};
/* eslint-enable @typescript-eslint/no-require-imports */

// Escalation order used to decide whether a server state overrides the local one.
const ORDER: ProtocolState[] = ["IDLE", "ARMED", "SAFE", "RESOLVED_MONITORING", "AMBER", "LATE_CHECK", "EMERGENCY", "CANCEL_HOLD", "CRITICAL"];
const rank = (s: ProtocolState) => ORDER.indexOf(s);
const ARRIVAL_PROMPT_MS = 5 * 60_000;
const NUDGE_MS = 15 * 60_000;
const ARM_LEAD_MS = 10 * 60_000;

export type KeywordKind = "emergency" | "help" | "sos" | "are_you_safe" | "police_keyword";
export type ServerReply = { state: ProtocolState; actions?: Action[]; liveAllowed?: boolean };
export type RunnerOpts = {
  journeyId?: string; // tests / explicit binding; otherwise the journey in the store
  onChallenge?: (c: Challenge) => void; // UI hook (the modal also reads the store)
  stationaryFeed?: { onTier2Passed: () => void };
  onTick?: (pos: { lat: number; lng: number }) => void; // stationary / route feeds (Tasks/07 Task 9)
};

// Run one side effect and never let it throw — sync (a module that fails to load,
// a mocked effect returning undefined) or async. The protocol must keep moving.
const safe = (fn: () => unknown, what: string): Promise<void> => {
  try {
    return Promise.resolve(fn()).then(
      () => undefined,
      (e) => console.warn(`[runner] ${what} failed`, (e as Error)?.message)
    );
  } catch (e) {
    console.warn(`[runner] ${what} failed`, (e as Error)?.message);
    return Promise.resolve();
  }
};

export function createRunner(opts: RunnerOpts = {}) {
  const t: Partial<Record<"speak" | "crit" | "arrival" | "reconfirm" | "arm" | "siren", ReturnType<typeof setTimeout>>> = {};
  let nudge: ReturnType<typeof setInterval> | null = null;
  let lastConfirmAt = 0;
  let arrivalFired = false;
  let etaFired = false;
  let practice = false;
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const store = () => useJourney.getState();
  const jid = () => opts.journeyId ?? (store().journey?.id as string | undefined) ?? null;
  const log = (type: string, payload: unknown) => safe(() => events.log(type, payload, jid()), `log ${type}`);
  const haptic = () => safe(() => svc.haptics.impactAsync(svc.haptics.ImpactFeedbackStyle.Medium), "haptic");
  const clearT = (k: keyof typeof t) => {
    if (t[k]) clearTimeout(t[k]);
    t[k] = undefined;
  };

  function clearChallenge() {
    clearT("speak");
    clearT("crit");
    clearT("arrival");
    store().set({ challenge: null });
  }

  function openChallenge(kind: ChallengeUiKind, reason: string, ending: boolean) {
    const t0 = Date.now();
    const d = challengeDeadlines(t0);
    const c: Challenge = {
      kind,
      reason,
      ending,
      deadline: kind === "arrival" ? t0 + ARRIVAL_PROMPT_MS : d.criticalAt,
      speakerPrompt: kind !== "pause" && kind !== "arrival", // ADR-038: pause is silent
      typedOnly: kind === "pause",
      secondary: kind === "away", // "Change destination" → PLAN_CHANGE
    };
    clearT("speak");
    clearT("crit");
    clearT("arrival");
    store().set({ challenge: c });
    void log("challenge_start", { kind, reason, ending });
    opts.onChallenge?.(c);
    if (kind === "arrival") {
      t.arrival = setTimeout(() => void api.send({ type: "ARRIVAL_PROMPT_TIMEOUT" }), ARRIVAL_PROMPT_MS);
      return;
    }
    if (c.speakerPrompt) t.speak = setTimeout(() => void safe(() => svc.siren.speak(i18n.t("siren.areYouSafe")), "speak"), d.speakAt - t0);
    // ADR-042/C1-2: an expiry are-you-safe that times out cannot re-raise a fresh
    // alarm — a new journey needs a destination, selfie and safe word, none of
    // which are available here. Keep the local alarm loud (siren stays on,
    // overlay stays) and log it instead of sending a SOS the core reducer would
    // ignore anyway (ctx is already EMERGENCY/CRITICAL).
    t.crit = setTimeout(
      () => (kind === "expiry" ? void log("expiry_reraise_failed", { reason: "timeout" }) : void api.send({ type: "CHALLENGE_TIMEOUT" })),
      d.criticalAt - t0,
    );
  }

  async function verifySafeWord(input: string): Promise<boolean> {
    // ADR-043 item 5 (concern 1): the SAFE button sends an internal token the
    // text field can never produce. It is the explicit "I'm safe" affordance —
    // not a word — so a coerced "type the word SAFE" can never reproduce it.
    if (input === "__ui_safe__") return true;
    const currentJourney = store().journey as { id?: unknown; owner_id?: unknown; are_you_safe_word_hash?: unknown } | null;
    const journeyId = typeof currentJourney?.id === "string" ? currentJourney.id : "";
    // With an active journey the word is immutable for that journey's life. ONLY
    // the per-journey SecureStore cache (offline-safe, written at creation) or
    // the journey's own server hash may verify it — never the global history and
    // never the literal "safe", so an older journey's word cannot cancel this one.
    if (journeyId) {
      const cachedJourneyWord = typeof svc.secureWords.getJourneySafeWord === "function"
        ? await svc.secureWords.getJourneySafeWord(journeyId).catch(() => null)
        : null;
      if (!!cachedJourneyWord && matchKeyword(input, [cachedJourneyWord]) !== null) return true;
      const journeyVerdict = typeof svc.secureWords.verifyJourneySafeWord === "function"
        ? await svc.secureWords.verifyJourneySafeWord(input, currentJourney).catch(() => null)
        : null;
      if (journeyVerdict !== null) return journeyVerdict;
      // Neither the cache nor a server hash is reachable: this journey's word
      // cannot be verified here. Refuse rather than accept an unrelated match.
      void log("safe_word_unverifiable", { journeyId });
      return false;
    }
    // No active journey (Home SOS / expiry with no journey): the global history
    // is the only source. The literal "safe" is no longer accepted.
    return matchKeyword(input, await svc.secureWords.get("are_you_safe")) !== null;
  }

  async function callGuardian() {
    try {
      const { supabase } = await import("../lib/supabase");
      const ownerId = store().journey?.owner_id as string | undefined;
      if (!ownerId) return;
      const { data } = await supabase
        .from("contacts")
        .select("phone")
        .eq("owner_id", ownerId)
        .order("tier", { ascending: true })
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      const phone = (data as { phone?: string } | null)?.phone;
      if (!phone) {
        void log("call_guardian", { ok: false, why: "no contact" });
        return;
      }
      void log("call_guardian", { ok: true });
      await Linking.openURL(`tel:${phone}`);
    } catch (e) {
      console.warn("[runner] call guardian failed", (e as Error)?.message);
    }
  }

  // J2: create + adopt a minimal emergency journey for a Home SOS. Returns the new
  // id, or null (and flags guardiansPending) when it cannot — an offline SOS keeps
  // the loud local alarm rather than crashing or silently claiming guardians know.
  async function ensureEmergencyJourney(): Promise<string | null> {
    try {
      const { supabase } = require("../lib/supabase"); // eslint-disable-line @typescript-eslint/no-require-imports
      const { data: auth } = await supabase.auth.getUser();
      const userId = (auth as { user?: { id: string } } | null)?.user?.id;
      if (!userId) {
        void log("sos_no_journey", { ok: false, reason: "no_user" });
        store().set({ guardiansPending: true });
        return null;
      }
      const { createEmergencyJourney } = require("./journey"); // eslint-disable-line @typescript-eslint/no-require-imports
      const { id } = await createEmergencyJourney(userId);
      store().set({ journey: { id, owner_id: userId }, guardiansPending: false });
      void log("sos_journey_created", { journeyId: id });
      return id;
    } catch (e) {
      void log("sos_no_journey", { ok: false, error: (e as Error)?.message });
      store().set({ guardiansPending: true });
      return null;
    }
  }

  // M1: the loop only starts on a live transition, so a restart while waiting or quiet needs it.
  const startPhotos = async (id: string) => {
    if (!store().camRunning) await safe(() => svc.camera.start(id, () => {}), "camera.start");
  };

  async function effect(a: Action, reason: string) {
    switch (a) {
      case "SHARE_LOCATION":
        if (!practice) await safe(() => svc.location.start(), "location.start");
        break;
      case "START_CHALLENGE":
        openChallenge("check", reason, false);
        break;
      case "START_END_CHALLENGE":
        openChallenge("check", reason, true);
        break;
      case "START_CHALLENGE_PAUSE":
        openChallenge("pause", reason, false);
        break;
      case "START_CHALLENGE_STATIONARY":
        openChallenge("stationary", reason, false);
        break;
      case "START_CHALLENGE_ROUTE":
        openChallenge("route", reason, false);
        break;
      case "START_CHALLENGE_AWAY":
        openChallenge("away", reason, false);
        break;
      case "ARRIVAL_PROMPT":
        openChallenge("arrival", reason, true);
        break;
      case "SIREN_ON":
        // Whatever asked for it (a server reply included): silent stays silent.
        if (!practice && store().ctx.alarmMode !== "silent") await safe(() => svc.siren.start(), "siren.start");
        break;
      case "SIREN_OFF":
        await safe(() => svc.siren.stop(), "siren.stop");
        break;
      case "START_RECONFIRM_TIMER":
        lastConfirmAt = Date.now();
        clearT("reconfirm");
        t.reconfirm = setTimeout(() => {
          if (reconfirmDue(lastConfirmAt, Date.now())) void api.send({ type: "RECONFIRM_MISSED" });
        }, RECONFIRM_MS);
        break;
      case "CAMERA_PAUSE": // ADR-038: frames stop, one haptic now, then a nudge every 15 min
        void safe(() => svc.frameLoop.pause(), "frameLoop.pause");
        void haptic();
        if (nudge) clearInterval(nudge);
        nudge = setInterval(() => void haptic(), NUDGE_MS);
        break;
      case "CAMERA_RESUME":
        void safe(() => svc.frameLoop.resume(), "frameLoop.resume");
        if (nudge) clearInterval(nudge);
        nudge = null;
        break;
      case "CALL_GUARDIAN":
        if (!practice) await callGuardian();
        break;
      case "ASK_FEEDBACK":
        // journey_completed: RESOLVED is the terminal safe state reached on arrival
        // or a confirmed end challenge. Fires once, before teardown. jid() gives the
        // journey_id so it is attributed to the owner for the north-star metric.
        void log("journey_completed", {});
        await api.stop();
        break;
      case "SIREN_HOLD": // ADR-014 gate 1: pause the siren but keep it armed
        await safe(() => svc.siren.hold(), "siren.hold");
        break;
      case "HEIGHTENED_MODE":
        // ctx.heightened is already set by the reducer; nothing to run on-device here.
        break;
      default:
        // FRAME_FAST/NORMAL: the camera loop reads cadenceMs(state). NOTIFY_*, START_LIVE
        // are server-side (fanned out by /api/journey-state), not on-device.
        break;
    }
  }

  async function run(ev: ProtocolEvent) {
    const before = store().ctx;
    const r = transition(before, ev);
    if (ev.type === "CHALLENGE_PASSED" || ev.type === "CHALLENGE_TIMEOUT" || ev.type === "ARRIVAL_PROMPT_TIMEOUT") clearChallenge();
    store().set({ ctx: r.ctx });
    void log(practice ? "practice_event" : "protocol_event_local", { ev, from: before.state, to: r.ctx.state, reason: r.reason });
    // ADR-043 rule 3: the wearer's own SOS tap gives a 10 s grace before the siren
    // (the EmergencyOverlay shows the matching countdown + "Not an emergency"). A
    // spoken distress KEYWORD or a danger-score escalation still sirens at once.
    const deferSiren = ev.type === "SOS" && r.ctx.state === "CRITICAL" && r.ctx.alarmMode === "siren";
    const ran = new Set<Action>();
    for (const a of r.actions) {
      ran.add(a);
      if (a === "SIREN_ON" && deferSiren && !practice) {
        clearT("siren");
        t.siren = setTimeout(() => void safe(() => svc.siren.start(), "siren.start"), SOS_SIREN_DELAY_MS);
        continue;
      }
      await effect(a, r.reason);
    }
    // Fix AD round 2: a cancel request cancels the pending SOS-grace siren (SIREN_HOLD
    // already paused any playing siren). The retry clock runs on the server.
    if (ev.type === "CANCEL_REQUESTED") clearT("siren");
    let id = jid();
    // J2: SOS / an emergency word from Home enters CRITICAL with no journey, so the
    // POST below would be skipped and guardians never alerted (while the overlay
    // claims they were). Create a minimal emergency journey server-side, adopt it,
    // then sync as normal. If that fails (offline) keep the loud local CRITICAL and
    // flag guardiansPending so the overlay shows "Reaching your guardians…".
    if (!id && !practice && store().ctx.state === "CRITICAL") {
      id = await ensureEmergencyJourney();
    }
    if (!id || practice) return;
    // Home SOS has no ARM timer, so it used to create the emergency journey and
    // raise the siren without ever starting the camera loop. Start it after the
    // journey id exists; camera.start() already waits briefly for ActiveJourneyCamera
    // to mount. Existing journey loops are left untouched by its running guard.
    if (!store().camRunning && (store().ctx.state === "EMERGENCY" || store().ctx.state === "CRITICAL")) {
      await safe(() => svc.camera.start(String(id), () => {}), "camera.start");
    }
    // H1: what raises an alarm, and the emergency word, are saved on the phone before the post
    // and delivered in order until the server has them.
    const durable = ev.type === "KEYWORD" || ev.type === "SOS" || (r.ctx.state !== before.state && (r.ctx.state === "CRITICAL" || r.ctx.state === "EMERGENCY"));
    if (ev.type === "KEYWORD" && before.cancelWaiting) {
      const m = await cancelOfflineMarker.read();
      if (m) await cancelOfflineMarker.save({ ...m, quiet: true });
    }
    const queued = durable ? await eventOutbox.add({ journeyId: id, kind: "event", event: ev }, true) : null;
    if (queued && (await eventOutbox.hasEarlier(queued))) {
      eventOutbox.release(queued);
      void eventOutbox.deliver();
      return;
    }
    try {
      const srv = await post<ServerReply>("/api/journey-state", { journeyId: id, event: ev });
      if (queued) await eventOutbox.remove(queued);
      if (!srv) return;
      const cur = store().ctx;
      if (srv.state && srv.state !== "RESOLVED" && rank(srv.state) > rank(cur.state)) {
        store().set({ ctx: { ...cur, state: srv.state } });
        void log("server_state_adopted", { from: cur.state, to: srv.state });
        if ((srv.state === "EMERGENCY" || srv.state === "CRITICAL") && !ran.has("SIREN_ON")) {
          ran.add("SIREN_ON");
          await effect("SIREN_ON", "server");
        }
      }
      for (const a of srv.actions ?? []) {
        if (ran.has(a)) continue;
        ran.add(a);
        await effect(a, "server");
      }
    } catch (e) {
      console.warn("[runner] server unreachable, local authority", (e as Error)?.message);
      if (queued && isFinalRefusal(e)) await eventOutbox.remove(queued);
      else if (queued) eventOutbox.release(queued);
    }
  }

  const api = {
    setPractice(b: boolean) {
      practice = b;
    },
    // X5a: the UI reads this to route a practice drill's cancel/proof flow to the
    // simulation deps (self-email), never the guardian path.
    isPractice() {
      return practice;
    },
    onChallengeResolved(cb: () => void) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    // Serialised: one transition at a time, in arrival order.
    send(ev: ProtocolEvent & { journey?: unknown }): Promise<void> {
      if (ev.type === "ARM" && ev.journey) return api.arm(ev.journey as Record<string, unknown>); // journey/new.tsx hands the row with ARM
      const p = queue.then(() => run(ev));
      queue = p.catch((e) => console.warn("[runner] send failed", ev.type, (e as Error)?.message));
      return p;
    },
    async arm(journey: Record<string, unknown>) {
      store().set({ journey, ctx: initialContext(), challenge: null, lastScore: 0 });
      arrivalFired = etaFired = false;
      const startAt = new Date(String(journey.start_at)).getTime();
      const armAt = (Number.isFinite(startAt) ? startAt : Date.now()) - ARM_LEAD_MS; // no/invalid start_at → arm now
      const delay = Math.max(0, armAt - Date.now());
      clearT("arm");
      t.arm = setTimeout(async () => {
        await api.send({ type: "ARM" }); // SHARE_LOCATION → svc.location.start() (gps + keyword listener)
        if (!practice) await safe(() => svc.camera.start(String(journey.id), (raw) => {
          // /api/analyze returns EnsembleOutcome.danger. The old cast renamed
          // nothing at runtime, so `undefined` reached fuseScore and a healthy
          // frame was treated as the fallback score. Normalize at this API
          // boundary and reject malformed responses without changing protocol
          // state.
          const result = raw as { danger?: unknown; score?: unknown; reasons?: unknown };
          const value = result.danger ?? result.score;
          const score = value === 0 || value === 1 || value === 2 || value === 3 ? value as DangerScore : null;
          if (score === null) {
            void log("frame_score_invalid", { value });
            return;
          }
          const reasons = Array.isArray(result.reasons) ? result.reasons.filter((r): r is string => typeof r === "string") : [];
          api.onScore({ score, reasons });
        }), "camera.start");
        await api.send({ type: "MONITOR_START" });
        if (!practice) await safe(() => svc.feeds.attach(), "feeds.attach"); // ADR-039/040 device feeds
      }, delay);
      await log("armed_scheduled", { armAt, delayMs: delay });
    },
    // Keyword listener (started by location.start): the safe word answers an open
    // challenge; the police keyword is logged; everything else escalates (ADR-013).
    onKeyword(kind: KeywordKind, word = "") {
      if (kind === "are_you_safe") {
        if (store().challenge) void api.resolveChallenge(word);
        return;
      }
      if (kind === "police_keyword") {
        void log("police_keyword_heard", {});
        return;
      }
      void api.send({ type: "KEYWORD", kind });
    },
    onScore(s: { score: DangerScore; reasons: string[] }) {
      const st = store();
      const fused = fuseScore(0, s.score);
      st.set({ lastScore: fused });
      if (fused >= 1) void api.send({ type: "SCORE", score: fused, reasons: s.reasons as never });
      else if (st.ctx.state === "AMBER" && st.challenge === null && lastConfirmAt > 0 && Date.now() - lastConfirmAt >= RECONFIRM_MS) void api.send({ type: "SIGNALS_SAFE" });
    },
    // Q3 journey-end rule: arrival within the expected duration → ARRIVED once;
    // expected duration passed without arrival → LATE once.
    tick(pos: { lat: number; lng: number }) {
      const st = store();
      const j = st.journey as { to_lat?: number; to_lng?: number; start_at?: string; eta_seconds?: number } | null;
      opts.onTick?.(pos);
      if (!j || st.ctx.state === "IDLE" || st.ctx.state === "ARMED" || st.ctx.state === "RESOLVED" || st.ctx.ending) return;
      const startAt = new Date(String(j.start_at)).getTime();
      const eta = Number(j.eta_seconds ?? 0);
      if (!arrivalFired && typeof j.to_lat === "number" && typeof j.to_lng === "number" && arrivalDue(haversineM(pos, { lat: j.to_lat, lng: j.to_lng }))) {
        arrivalFired = true;
        void api.send({ type: "ARRIVED" });
        return;
      }
      if (!etaFired && eta > 0 && lateDue(startAt, eta, Date.now())) {
        etaFired = true;
        void api.send({ type: "LATE" });
      }
    },
    // input: the spoken/typed safe word, or a UI result token: "safe" | "danger" | "secondary".
    async resolveChallenge(input: string, guardianConfirmed = false): Promise<boolean> {
      const c = store().challenge;
      // The EMERGENCY overlay has a second, post-challenge safe-word action.
      // Route it through this same verifier so it cannot accept an old journey
      // word from the global history. Other no-challenge states reject input.
      if (!c && store().ctx.state !== "EMERGENCY") return false;
      const token = input.trim().toLowerCase();
      if (token === "danger") {
        // ADR-042/C1-2: same fallback as the expiry timeout — no fresh journey
        // can be raised from here, so keep the alarm loud rather than send a
        // SOS the core reducer would ignore.
        if (!c || c.kind === "expiry") {
          void log("expiry_reraise_failed", { reason: "danger" });
          return false;
        }
        await api.send({ type: "SOS" });
        return true;
      }
      if (token === "secondary") {
        if (!c || c.kind !== "away") return false;
        clearChallenge();
        await api.send({ type: "PLAN_CHANGE" });
        return true;
      }
      const ok = await verifySafeWord(input);
      void log("challenge_answer", { ok, kind: c?.kind ?? "emergency_overlay", guardianConfirmed });
      if (!ok) return false;
      if (!c) {
        await api.send({ type: "CHALLENGE_PASSED", guardianConfirmed });
        return true;
      }
      // ADR-042/R47c: a verified expiry pass resolves LOCALLY (the server journey
      // is already terminal) — siren off, monitoring stops, the notice stays.
      if (c.kind === "expiry") {
        clearChallenge();
        await safe(() => svc.siren.stop(), "siren.stop");
        await api.stop();
        store().set({ ctx: { ...store().ctx, state: "RESOLVED" }, expiry: { ...(store().expiry ?? { at: Date.now(), variant: "expired" }), resolved: true } });
        return true;
      }
      listeners.forEach((cb) => cb());
      if (c.kind === "pause") await api.send({ type: "CHALLENGE_PASSED", pauseSensor: "cam" });
      else await api.send({ type: "CHALLENGE_PASSED", guardianConfirmed });
      if (c.kind === "stationary") opts.stationaryFeed?.onTier2Passed();
      return true;
    },
    // ADR-042/R47b: the alarm follows the account. On app start after auth and on
    // every foreground resume, reconcile the local store against the server:
    //  - fresh phone (no local journey) + a live monitoring journey on the server
    //    → adopt it and start monitoring so the overlay + password cancel work here;
    //  - local phone still in EMERGENCY/CRITICAL but the server archived the
    //    journey (expired/done) → show the expiry are-you-safe. Guardians are never
    //    asked anything. No-op when unauthenticated or in practice mode.
    async reconcile() {
      if (practice) return;
      // Founder Q117: offline photos go up once there is a network, even after the trip.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      void safe(() => (require("./frameQueue") as typeof import("./frameQueue")).frameQueue.drain(), "frameQueue.drain");
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { supabase } = require("../lib/supabase");
        // Before anything that needs the network: the correct word given offline survives
        // the app being killed. Read from the phone alone, so it works with no signal.
        if (!store().journey) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { cancelOfflineMarker } = require("./cancelOfflineMarker") as typeof import("./cancelOfflineMarker");
          const m = await cancelOfflineMarker.read();
          if (m) {
            const { data: sess } = await supabase.auth.getSession();
            if ((sess as { session?: { user?: { id?: string } } | null } | null)?.session?.user?.id === m.owner_id) {
              store().set({ journey: { ...m }, ctx: { ...initialContext(), state: "CRITICAL", alarmMode: m.alarm_mode ?? "siren", ...(m.quiet ? { quietAlarm: true } : { cancelWaiting: true }) }, cancelOffline: !m.quiet, challenge: null, lastScore: 0, expiry: null });
              void log("cancel_offline_restored", { journeyId: m.id, quiet: !!m.quiet });
              await safe(() => svc.location.start(), "location.start");
              await safe(() => svc.feeds.attach(), "feeds.attach");
              await startPhotos(m.id); // M1
            } else {
              await cancelOfflineMarker.clear();
            }
          }
        }
        // H1: whatever a killed app still owes the server, even with nothing else to adopt.
        void safe(() => eventOutbox.deliver(), "eventOutbox.deliver");
        const { data: auth } = await supabase.auth.getUser();
        const user = (auth as { user?: { id: string } } | null)?.user;
        if (!user) return;
        const local = store().journey as { id?: string } | null;
        const st = store().ctx.state;
        // Fix AD round 2: while a guardian cancel waits, expiry must not disturb her
        // screen; the offline retry still goes through after it. M3: nor a quiet alarm's.
        if (local?.id && (store().ctx.cancelWaiting || store().ctx.quietAlarm)) return;
        if (local?.id && (st === "EMERGENCY" || st === "CRITICAL")) {
          const { data: srv } = await supabase.from("journeys").select("status").eq("id", local.id).maybeSingle();
          const status = (srv as { status?: string } | null)?.status;
          if (status === "expired" || status === "done") {
            store().set({ expiry: { at: Date.now(), variant: status === "done" ? "ended" : "expired" } });
            openChallenge("expiry", "expiry", false);
          }
          return;
        }
        if (!local?.id) {
          const { data: live } = await supabase
            .from("journeys")
            .select("*")
            .eq("owner_id", user.id)
            .eq("status", "monitoring")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          let j = live;
          // A cancel still waiting on guardians outlives expiry (the clock keeps asking),
          // so a restart picks it up too, with the verdict watch and the question.
          if (!j) {
            const { data: waiting } = await supabase
              .from("cancel_requests")
              .select("journey_id")
              .eq("owner_id", user.id)
              .is("resolved_at", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            const waitingId = (waiting as { journey_id?: string } | null)?.journey_id;
            if (waitingId) ({ data: j } = await supabase.from("journeys").select("*").eq("id", waitingId).eq("status", "expired").maybeSingle());
          }
          if (!j) return;
          const { data: stRow } = await supabase
            .from("journey_state")
            .select("state")
            .eq("journey_id", (j as { id: string }).id)
            .order("changed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const adopted = ((stRow as { state?: ProtocolState } | null)?.state as ProtocolState) ?? "SAFE";
          // Fix AD round 2: a restart during a guardian cancel keeps her screen normal.
          const { data: openReq } = adopted === "CRITICAL" || adopted === "CANCEL_HOLD"
            ? await supabase.from("cancel_requests").select("id").eq("journey_id", (j as { id: string }).id).is("resolved_at", null).limit(1).maybeSingle()
            : { data: null };
          // Founder Q116: closed by the emergency word stays quiet across a restart.
          const { data: lastReq } = adopted === "CRITICAL" && !openReq
            ? await supabase.from("cancel_requests").select("verdict").eq("journey_id", (j as { id: string }).id).order("created_at", { ascending: false }).limit(1).maybeSingle()
            : { data: null };
          const quiet = (lastReq as { verdict?: string } | null)?.verdict === "distress";
          store().set({ journey: j, ctx: { ...initialContext(), state: adopted, alarmMode: (j as { alarm_mode?: "siren" | "silent" | null }).alarm_mode ?? "siren", ...(openReq ? { cancelWaiting: true } : {}), ...(quiet ? { quietAlarm: true } : {}) }, challenge: null, lastScore: 0, expiry: null });
          void log("journey_adopted", { journeyId: (j as { id: string }).id, state: adopted });
          await safe(() => svc.location.start(), "location.start"); // heartbeats + audio + keyword
          await safe(() => svc.feeds.attach(), "feeds.attach"); // camera mounts via ActiveJourneyCamera
          if (openReq || quiet) await startPhotos((j as { id: string }).id); // M1
        }
      } catch (e) {
        console.warn("[runner] reconcile failed", (e as Error)?.message);
      }
    },
    // M6: 2 Not safe overturned a Safe; the server is already CRITICAL and guardians told, so
    // nothing is posted. The alarm comes back as decided: at once, silent stays silent.
    adoptOverturn(): Promise<void> {
      const p = queue.then(async () => {
        const before = store().ctx;
        if (before.state !== "RESOLVED_MONITORING") return;
        const r = transition(before, { type: "SOS", mode: before.alarmMode });
        store().set({ ctx: r.ctx, cancelApproved: false });
        void log("overturn_adopted", { mode: before.alarmMode });
        for (const a of r.actions) await effect(a, "overturn");
      });
      queue = p.catch((e) => console.warn("[runner] overturn failed", (e as Error)?.message));
      return p;
    },
    // Re-open the expiry are-you-safe from the ExpiryNotice banner.
    openExpiryChallenge() {
      openChallenge("expiry", "expiry", false);
    },
    // ADR-043 rule 6: verify a typed answer against the CURRENT journey only (the
    // cancel flow's step 2 and the are-you-safe challenge share this). Exposed for
    // CancelFlow's injected verifyWord dep.
    verifySafeWord(input: string): Promise<boolean> {
      return verifySafeWord(input);
    },
    // ADR-043 rule 5: opening the cancel flow holds the siren (cancels the pending
    // 10 s SOS-grace start and pauses a playing siren) while she enters her password.
    holdSirenForCancel() {
      clearT("siren");
      void safe(() => svc.siren.hold(), "siren.hold");
    },
    // ADR-043 rule 5: the 2nd wrong app password in Siren mode starts/keeps the siren.
    resumeSirenAfterCancel() {
      if (!practice) void safe(() => svc.siren.start(), "siren.start");
    },
    async stop() {
      clearChallenge();
      clearT("reconfirm");
      clearT("arm");
      clearT("siren");
      if (nudge) clearInterval(nudge);
      nudge = null;
      void safe(() => svc.feeds.detach(), "feeds.detach");
      void safe(() => svc.cancelFlow.dispose(), "cancelFlow.dispose"); // ADR-014: clear holds + realtime
      void safe(() => svc.frameLoop.resume(), "frameLoop.resume");
      void safe(() => svc.camera.stop?.(), "camera.stop");
      await safe(() => svc.location.stop(), "location.stop");
      await safe(() => svc.siren.stop(), "siren.stop");
      await safe(() => events.flush(), "events.flush");
    },
  };
  return api;
}

export type Runner = ReturnType<typeof createRunner>;
export const runner: Runner = createRunner();
