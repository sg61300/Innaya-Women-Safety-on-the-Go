// Task 26: hidden camera frame loop -> mask (ADR-019 gate) -> upload -> analyze.
// Product cadence: one frame / 5 min in SAFE, one / 1 min once the journey is
// AMBER or worse. The masking gate (services/sensors/masker.ts) runs
// on every frame BEFORE upload; if masking is unavailable it throws and the
// frame is dropped — a raw frame is never uploaded.
import type { CameraView } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import type { ProtocolState } from "@vaira/core";
// H1: decode masked-frame base64 to bytes with a pure-JS decoder. Android's native
// `fetch` cannot open a `data:` URL, so we never build one — we upload the decoded
// bytes directly (supabase-js storage accepts an ArrayBufferView in React Native;
// see storage-js docs: "For React Native ... upload using ArrayBuffer from base64").
import { toByteArray } from "base64-js";
import { supabase } from "../lib/supabase";
import { post } from "../lib/api";
import { events } from "../lib/events";
import { useJourney } from "../store/journey";
import { getMasker } from "./sensors/masker";
import { frameQueue } from "./frameQueue";
// Task 26b (R42): the native lane is built on EAS. Importing skiaMasker for its
// side effect swaps the fail-closed NoopMasker for the real Skia + ML Kit masker
// (ADR-019 / R36). The three native deps are lazy-required inside functions, so
// this import loads no native code under jest. EAS `build --profile preview`
// compiles them; the orchestrator runs it after merge and the founder verifies
// on a device.
import "./sensors/skiaMasker";

// Lite mode still controls other low-battery sensor semantics, but does not
// create a separate camera cadence.
export const cadenceMs = (s: ProtocolState, _lite = false, _alarmElapsedMs = 0) =>
  s === "SAFE" ? 300_000 : 60_000;

// ARM can transition the store before React has committed the layout-mounted
// CameraView. Retry the mount briefly instead of treating that normal commit
// window as a pipeline failure and waiting for the full frame cadence.
const CAMERA_MOUNT_RETRY_MS = 250;
const CAMERA_MOUNT_TIMEOUT_MS = 10_000;

// The 30 s rolling transcript comes from the audio listener (lane A / W4). It is
// injected so the camera service stays decoupled and testable; default is empty.
let getTranscript: () => string = () => "";
export function setTranscriptProvider(fn: () => string) {
  getTranscript = fn;
}

// Upload with bounded exponential back-off. Transient storage failures (network
// blips) are retried; a persistent failure is thrown so the caller flags the
// camera sensor as degraded (UX §7.2) rather than silently dropping frames.
export async function uploadWithRetry(
  path: string,
  // H1: raw bytes of the masked JPEG (ArrayBufferView), not a Blob. supabase-js
  // storage `upload` accepts an ArrayBufferView; Blob/File/FormData "does not work
  // as intended" in React Native (storage-js docs).
  body: Uint8Array,
  opts: { attempts?: number; baseMs?: number } = {}
): Promise<void> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 400;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const { error } = await supabase.storage
      .from("frames")
      .upload(path, body, { contentType: "image/jpeg" });
    if (!error) return;
    lastErr = error;
    // A 4xx is the server refusing this request (RLS denial, bad path); retrying
    // cannot help, so fail fast rather than burning the back-off budget.
    const code = Number((error as { statusCode?: string | number }).statusCode);
    if (code >= 400 && code < 500) {
      throw new Error(`frame upload rejected (${code}): ${(error as Error)?.message ?? error}`);
    }
    if (i < attempts - 1) await sleep(baseMs * 2 ** i);
  }
  throw new Error(`frame upload failed after ${attempts} attempts: ${(lastErr as Error)?.message ?? lastErr}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reject a promise if it does not settle within `ms`, always clearing the timer
// so a resolved capture leaves no dangling timeout. Guards against a native
// takePictureAsync hang stalling the loop forever with `cam` stuck true.
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(msg)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t)) as Promise<T>;
}

let ref: CameraView | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
// Incremented on every start()/stop(). A loop captures its epoch at start; after
// each await it bails if `running` flipped or a newer loop superseded it, so a
// stopped or replaced loop never uploads, sets state or fires onScore.
let epoch = 0;

let paused = false; // ADR-038 verified pause: loop keeps ticking, captures nothing

// J2 stage instrumentation. `mountedLogged` fires the "camera-mounted" line once
// per start(); `firstFailureLogged` guarantees exactly ONE `frame_pipeline` events
// row per journey, at the first failing stage, so a read-only SELECT on `events`
// shows where the pipeline died even with no logcat attached.
let mountedLogged = false;
const firstFailureLogged = new Set<string>();

const nextCadenceMs = (): number => {
  const st = useJourney.getState();
  const s = st.ctx.state as ProtocolState;
  return cadenceMs(s, st.lite);
};

export const camera = {
  attach(r: CameraView | null) {
    ref = r;
  },
  setPaused(b: boolean) {
    paused = b;
  },
  async start(journeyId: string, onScore: (s: unknown) => void) {
    if (running) return; // a loop is already active — do not spawn a second one
    const my = ++epoch;
    running = true;
    mountedLogged = false;
    firstFailureLogged.delete(journeyId); // a re-armed journey may re-log its first failure
    useJourney.getState().set({ camRunning: true }); // F3: overlay camera status line
    const mountWaitStartedAt = Date.now();
    // Do NOT mark cam healthy here — with the NoopMasker gate active every frame
    // is blocked, so an eager cam:true would flash "healthy" for one tick before
    // flipping false. cam:true is set only after the first frame actually scores.
    const loop = async () => {
      if (!running || my !== epoch) return;
      if (paused) {
      timer = setTimeout(loop, nextCadenceMs());
      return;
      }
      if (!ref && Date.now() - mountWaitStartedAt < CAMERA_MOUNT_TIMEOUT_MS) {
        timer = setTimeout(loop, CAMERA_MOUNT_RETRY_MS);
        return;
      }
      void frameQueue.drain(); // never holds up this capture; never rejects
      const st = useJourney.getState();
      // J2: the current pipeline stage, so a failure names exactly where it died
      // (both in the [frame] warn line and the one-per-journey frame_pipeline row).
      let stage = "mount";
      try {
        if (!ref) throw new Error("camera not mounted");
        if (!mountedLogged) {
          mountedLogged = true;
          console.log("[frame] camera-mounted ok");
        }

        stage = "capture";
        const pic = await withTimeout(
          ref.takePictureAsync({ quality: 0.4, skipProcessing: true }),
          8000,
          "camera capture timed out"
        );
        if (!running || my !== epoch) return;
        if (!pic?.uri) throw new Error("camera returned no frame");
        const small = await ImageManipulator.manipulateAsync(
          pic.uri,
          [{ resize: { width: 640 } }],
          // G1 (s17): pass the literal enum VALUE, not ImageManipulator.SaveFormat.JPEG.
          // expo-image-manipulator 57 re-exports SaveFormat as a TS enum; it is
          // undefined in the Hermes bundle at runtime, so reading `.JPEG` off it threw
          // "Cannot read property 'JPEG' of undefined" and every monitoring frame failed.
          { compress: 0.6, base64: false, format: "jpeg" as ImageManipulator.SaveFormat }
        );
        if (!running || my !== epoch) return;
        const dims = { w: small.width, h: small.height };
        console.log("[frame] captured ok", `${dims.w}x${dims.h}`);

        // --- MASK GATE (ADR-019 / R36): never upload a raw frame ---
        stage = "mask";
        const masked = await getMasker().maskFrame(small.uri, dims);
        if (!running || my !== epoch) return;
        await events.log(masked.degraded ? "mask_degraded" : "mask_applied", masked.counts, journeyId);
        console.log("[frame] masked ok", JSON.stringify({ ...masked.counts, degraded: masked.degraded }));

        stage = "upload";
        const capturedAt = Date.now();
        const path = `${journeyId}/${capturedAt}.jpg`;
        // H1: decode the masked base64 to bytes and upload those directly. The old
        // `fetch(masked.maskedUri).blob()` failed on-device every frame because
        // Android's native fetch rejects `data:` URLs (MalformedURLException:
        // unknown protocol: data), so events.model_call stayed 0 all-time.
        const bytes = toByteArray(masked.base64);
        try {
          await uploadWithRetry(path, bytes);
        } catch (e) {
          // Founder Q117: no network, so keep the masked frame (never a raw one) on the phone
          // and send it later. A server refusal stays dropped: a retry could not help. Only
          // during an alarm: a calm trip uses no memory on her phone.
          const alarmNow = ["EMERGENCY", "CRITICAL", "CANCEL_HOLD"].includes(useJourney.getState().ctx.state);
          if (alarmNow && !String((e as Error)?.message).includes("rejected"))
            await frameQueue.add({ journeyId, path, ts: capturedAt, base64: masked.base64, meta: { counts: masked.counts, degraded: masked.degraded, plate: masked.plateText } });
          throw e;
        }
        if (!running || my !== epoch) return;
        console.log("[frame] uploaded ok", JSON.stringify({ bytes: bytes.length, path }));
        useJourney.getState().set({ camLastFrameAt: Date.now() }); // F3: last frame reached the server
        // Tier 3 proof: the `frame` event carries the mask summary only — never
        // raw OCR text beyond the normalised plate — so masking is provable from
        // the events table without ever viewing a frame.
        await events.log(
          "frame",
          { path, counts: masked.counts, degraded: masked.degraded, plate: masked.plateText },
          journeyId
        );
        // The guardian reads frame rows while the journey is active. The
        // normal event queue is flushed at journey stop, which is too late for
        // live monitoring; flush this non-sensitive path/metadata row now and
        // keep the capture pipeline alive if telemetry is temporarily offline.
        await events.flush().catch((e) => console.warn("[frame] event flush failed", (e as Error)?.message ?? String(e)));

        // Body is the @vaira/core ScoreInput the route feeds to runEnsemble:
        // maskedFrameB64 (string), transcript30s, plateText and vitals are all
        // top-level. The camera has no vitals source, so hr/hrv are null.
        stage = "score";
        const scoreStart = Date.now();
        const score = await post<unknown>("/api/analyze", {
          journeyId,
          state: st.ctx.state,
          maskedFrameB64: masked.base64,
          transcript30s: getTranscript(),
          plateText: masked.plateText,
          vitals: { hr: null, hrv: null },
        });
        if (!running || my !== epoch) return;
        console.log("[frame] scored ok", JSON.stringify({ status: "ok", ms: Date.now() - scoreStart }));
        if (!useJourney.getState().sensors.cam) {
          const s = useJourney.getState();
          s.set({ sensors: { ...s.sensors, cam: true } });
        }
        onScore(score);
      } catch (e) {
        if (!running || my !== epoch) return; // stopped/superseded — do not touch state
        const msg = (e as Error).message;
        console.warn(`[frame] ${stage} failed ${msg}`);
        // J2: ONE frame_pipeline row per journey at the first failing stage. Mobile
        // events are flushed to the hosted `events` table at journey end, so after a
        // smoke run a read-only SELECT reveals the failing stage without logcat. A
        // `score`-stage failure carries the HTTP status from post() (e.g. "/api/analyze
        // 403"), which localises a failure that reached the api boundary.
        if (!firstFailureLogged.has(journeyId)) {
          firstFailureLogged.add(journeyId);
          await events.log("frame_pipeline", { stage, message: msg }, journeyId);
        }
        if (st.sensors.cam) {
          useJourney.getState().set({ sensors: { ...useJourney.getState().sensors, cam: false } });
          await events.log("sensor_flag", { cam: false, why: msg }, journeyId);
        }
      }
      if (!running || my !== epoch) return;
      timer = setTimeout(loop, nextCadenceMs());
    };
    loop();
  },
  stop() {
    running = false;
    epoch++; // invalidate any in-flight loop
    if (timer) clearTimeout(timer);
    timer = null;
    // Pause is journey-scoped. A stopped journey must not leave the next
    // journey's newly-started loop silently skipping every capture.
    paused = false;
    const s = useJourney.getState();
    s.set({ sensors: { ...s.sensors, cam: false }, camRunning: false }); // F3
  },
};
