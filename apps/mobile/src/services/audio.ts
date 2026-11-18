import * as FileSystem from "expo-file-system/legacy";
import { matchKeyword, BUILTIN_TRIGGERS } from "@vaira/core";
import { secureWords } from "./secureWords";
import { useJourney } from "../store/journey";
import { useSession } from "../store/session";
import { events } from "../lib/events";

// Task 25 (ADR-036 / ADR-034): offline wake-word spotting + a 30 s transcript
// ring buffer. EN/HI run react-native-vosk in grammar mode; KN runs
// expo-speech-recognition continuous mode with an auto-restart loop. The active
// language decides which engine holds the mic (they never share it). The listener
// starts/stops with the journey foreground service (location.start/stop), never
// with the UI.

// ---- Pure 30 s ring buffer ---------------------------------------------------
export class RingBuffer {
  private items: { ts: number; text: string }[] = [];
  constructor(private windowMs: number) {}
  push(text: string, ts = Date.now()) {
    this.items.push({ ts, text });
    this.items = this.items.filter((i) => ts - i.ts <= this.windowMs);
  }
  text(now = Date.now()) {
    return this.items
      .filter((i) => now - i.ts <= this.windowMs)
      .map((i) => i.text)
      .join(" ");
  }
}

// ---- Continuous-recognizer restart loop (Kannada) ----------------------------
// expo-speech-recognition ends its session on silence; to keep listening we
// restart on the "end" event immediately and on "error" after a back-off, until
// stop() is called. Factored out so the loop is unit-testable with fake timers.
export function createContinuousRecognizer(opts: { start: () => void; backoffMs?: number }) {
  const backoff = opts.backoffMs ?? 500;
  let active = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    start() {
      active = true;
      opts.start();
    },
    onEnd() {
      if (active) opts.start();
    },
    onError() {
      if (!active) return;
      clear();
      timer = setTimeout(() => {
        if (active) opts.start();
      }, backoff);
    },
    stop() {
      active = false;
      clear();
    },
  };
}

type Kind = "emergency" | "help" | "sos" | "are_you_safe" | "police_keyword";

// vosk-model-en-in / vosk-model-small-hi, downloaded on first run (amendment).
const VOSK_MODELS: Record<"en" | "hi", { url: string; dir: string }> = {
  // Small EN model (~37 MB) instead of the ~1 GB vosk-model-en-in-0.5, so the
  // journey-start download is viable on a phone (A6b). HI is already the small model.
  en: { url: "https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip", dir: "vosk/en" },
  hi: { url: "https://alphacephei.com/vosk/models/vosk-model-small-hi-0.22.zip", dir: "vosk/hi" },
};

const rb = new RingBuffer(30_000);
// Generation counter: start() captures the current epoch; stop() bumps it. After
// every await, start()/startVosk() bail if the epoch moved, so a stop() that lands
// mid-provisioning wins and the resumed start() never re-arms the mic (A1).
let epoch = 0;
let voskLoaded = false;
// Keep the native Vosk TurboModule out of screen-import time. Home and other
// UI surfaces may load this service in Jest or a binary without Vosk; the
// listener start path still loads the same native module and falls back to STT
// when it is unavailable.
let vosk: typeof import("react-native-vosk") | null = null;
type SpeechRecognition = typeof import("expo-speech-recognition")["ExpoSpeechRecognitionModule"];
let speechRecognition: SpeechRecognition | null = null;
let subs: { remove: () => void }[] = [];
let kannada: ReturnType<typeof createContinuousRecognizer> | null = null;
let esrSubs: { remove: () => void }[] = [];

const jid = () => useJourney.getState().journey?.id ?? null;

function loadVosk(): typeof import("react-native-vosk") {
  if (vosk) return vosk;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  vosk = require("react-native-vosk") as typeof import("react-native-vosk");
  return vosk;
}

function loadSpeechRecognition(): SpeechRecognition {
  if (speechRecognition) return speechRecognition;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speechRecognition = (require("expo-speech-recognition") as typeof import("expo-speech-recognition")).ExpoSpeechRecognitionModule;
  return speechRecognition;
}

// Ensure an unzipped Vosk model directory exists, downloading on first run.
// On-device zip extraction needs a native unzip (react-native-zip-archive), added
// with the real-device pass (Task 35); until then a missing model throws and the
// caller falls back to the STT-only path. Returns the absolute model dir.
async function ensureVoskModel(lang: "en" | "hi"): Promise<string> {
  const { url, dir } = VOSK_MODELS[lang];
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error("no documentDirectory");
  const target = base + dir;
  const info = await FileSystem.getInfoAsync(target);
  if (info.exists && info.isDirectory) {
    // A dir is only valid if it actually holds an unzipped model (a `conf` entry).
    // A prior failed unzip can leave an empty dir that would otherwise short-circuit
    // provisioning forever (A6a); drop it and re-provision.
    const entries = await FileSystem.readDirectoryAsync(target).catch(() => [] as string[]);
    if (entries.includes("conf")) return target;
    await FileSystem.deleteAsync(target, { idempotent: true });
  }
  // Download to <target>.zip, unzip into <target>.tmp, then atomically move tmp →
  // target. `target` is never created directly, so a half-provisioned dir can never
  // masquerade as a finished model (A6a).
  const zip = `${target}.zip`;
  const tmp = `${target}.tmp`;
  // D11: downloadAsync/unzip do not create parent dirs. On a fresh install the
  // `vosk/` parent does not exist, so the download rejects with "Directory …
  // doesn't exist" and every new user falls back to stt_only. Create it first.
  const parent = target.slice(0, target.lastIndexOf("/"));
  await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
  await FileSystem.downloadAsync(url, zip);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let unzip: ((from: string, to: string) => Promise<string>) | null = null;
  try {
    unzip = require("react-native-zip-archive").unzip;
  } catch {
    unzip = null;
  }
  if (!unzip) throw new Error("vosk model unzip unavailable (react-native-zip-archive not installed)");
  await FileSystem.deleteAsync(tmp, { idempotent: true });
  await unzip(zip, tmp);
  await FileSystem.moveAsync({ from: tmp, to: target });
  return target;
}

async function startVosk(my: number, lang: "en" | "hi", grammar: string[], onKeyword: (k: Kind, w: string) => void, words: {
  emergency: string[];
  safe: string[];
  police: string[];
}) {
  const engine = loadVosk();
  const path = await ensureVoskModel(lang);
  if (my !== epoch) return; // stopped during model provisioning: nothing created yet
  try {
    await engine.loadModel(path);
    if (my !== epoch) {
      // stopped while the model loaded: unload it, register nothing.
      try {
        engine.unload();
      } catch {
        /* not loaded */
      }
      return;
    }
    voskLoaded = true;
    const handle = (t: string) => {
      if (!t) return;
      rb.push(t);
      route(t, onKeyword, words);
    };
    subs.push(engine.onResult((t: string) => handle(t)));
    subs.push(engine.onPartialResult((t: string) => handle(t)));
    subs.push(engine.onError((e: unknown) => console.warn("[audio] vosk error", e)));
    await engine.start({ grammar });
    if (my !== epoch) {
      // stopped while starting: tear down the subs, engine and loaded model.
      for (const s of subs) s.remove();
      subs = [];
      try {
        engine.stop();
        engine.unload();
      } catch {
        /* already stopped */
      }
      voskLoaded = false;
      return;
    }
  } catch (e) {
    // Partial failure (e.g. Vosk.start rejects after loadModel): remove any subs
    // and unload so the caller's catch does not stack the STT engine on a live
    // half-armed vosk (A2). Rethrow to trigger that fallback.
    for (const s of subs) s.remove();
    subs = [];
    try {
      engine.unload();
    } catch {
      /* not loaded */
    }
    voskLoaded = false;
    throw e;
  }
  void events.log("audio_mode", { mode: "vosk", lang }, jid());
}

function startKannada(onKeyword: (k: Kind, w: string) => void, words: {
  emergency: string[];
  safe: string[];
  police: string[];
}) {
  const engine = loadSpeechRecognition();
  const doStart = () => {
    try {
      engine.start({ lang: "kn-IN", interimResults: true, continuous: true });
    } catch (e) {
      console.warn("[audio] kn start", (e as Error).message);
    }
  };
  kannada = createContinuousRecognizer({ start: doStart, backoffMs: 500 });
  esrSubs.push(
    engine.addListener("result", (e: any) => {
      const t = e?.results?.[0]?.transcript ?? "";
      if (!t) return;
      rb.push(t);
      route(t, onKeyword, words);
    })
  );
  esrSubs.push(engine.addListener("end", () => kannada?.onEnd()));
  esrSubs.push(engine.addListener("error", () => kannada?.onError()));
  kannada.start();
  void events.log("audio_mode", { mode: "kannada_stt", lang: "kn" }, jid());
}

// Match one partial/final transcript against every keyword class, most-severe
// first, and fire the callback. Emergency word > builtin (help/sos) > safe word >
// police keyword — the order the runner (Task 27) expects.
// Per-kind last-fire clock: a partial and its final result carry the same
// utterance, so the same class must not fire twice within 3 s (A7). Exported for
// unit testing (like RingBuffer); `now` is injectable so the dedup is testable.
const lastFire: Partial<Record<Kind, number>> = {};
const DEDUP_MS = 3000;
export function route(
  t: string,
  onKeyword: (k: Kind, w: string) => void,
  words: { emergency: string[]; safe: string[]; police: string[] },
  now: number = Date.now()
) {
  const fire = (kind: Kind, w: string) => {
    if (now - (lastFire[kind] ?? -Infinity) < DEDUP_MS) return; // duplicate hit
    lastFire[kind] = now;
    void events.log("keyword", { kind }, jid());
    onKeyword(kind, w);
  };
  const em = matchKeyword(t, words.emergency);
  if (em) return fire("emergency", em);
  const bi = matchKeyword(t, [...BUILTIN_TRIGGERS]);
  if (bi) return fire(bi as "help" | "sos", bi);
  const sw = matchKeyword(t, words.safe);
  if (sw) return fire("are_you_safe", sw);
  const pk = matchKeyword(t, words.police);
  if (pk) return fire("police_keyword", pk);
}

export const audio = {
  async start(onKeyword: (kind: Kind, word: string) => void) {
    // The service is a singleton shared by Home and the journey foreground
    // service. Tear down any previous engine before arming a new one so a
    // remount, auth resume, or service restart cannot leave duplicate native
    // listeners competing for the microphone.
    await this.stop();
    const my = ++epoch;
    const [emergency, safe, police] = await Promise.all([
      secureWords.get("emergency"),
      secureWords.get("are_you_safe"),
      secureWords.get("police_keyword"),
    ]);
    if (my !== epoch) return; // stopped while reading secure words
    const words = { emergency, safe, police };
    const lang = (useSession.getState().profile?.language ?? "en") as "en" | "hi" | "kn";
    try {
      if (lang === "kn") {
        startKannada(onKeyword, words);
      } else {
        // Wake phrases + the user's secure words + builtin triggers; "[unk]" lets
        // Vosk reject everything outside the grammar (strict spotting).
        const grammar = ["help me", "vaira help", ...emergency, ...safe, ...police, ...BUILTIN_TRIGGERS, "[unk]"];
        await startVosk(my, lang, grammar, onKeyword, words);
      }
    } catch (e) {
      // Engine unavailable (e.g. model not yet provisioned): fall back to the
      // Kannada-style continuous STT path in the UI locale so the mic still spots
      // keywords, and log the degraded mode (VERIFY item on real hardware).
      console.warn("[audio] primary engine unavailable, stt_only", (e as Error).message);
      void events.log("audio_mode", { mode: "stt_only", why: (e as Error).message }, jid());
      const locale = ({ en: "en-IN", hi: "hi-IN", kn: "kn-IN" } as const)[lang];
      const doStart = () => {
        try {
          loadSpeechRecognition().start({ lang: locale, interimResults: true, continuous: true });
        } catch (err) {
          console.warn("[audio] stt_only start", (err as Error).message);
        }
      };
      kannada = createContinuousRecognizer({ start: doStart, backoffMs: 500 });
      esrSubs.push(
        loadSpeechRecognition().addListener("result", (ev: any) => {
          const t = ev?.results?.[0]?.transcript ?? "";
          if (!t) return;
          rb.push(t);
          route(t, onKeyword, words);
        })
      );
      esrSubs.push(loadSpeechRecognition().addListener("end", () => kannada?.onEnd()));
      esrSubs.push(loadSpeechRecognition().addListener("error", () => kannada?.onError()));
      kannada.start();
    }
    if (my !== epoch) return; // stopped while the fallback engine was arming
    // F9 (founder live test): mic:true is the REAL listener state (set only once an
    // engine has actually armed). The active-journey "Listening" indicator binds to
    // it; this logcat line is the on-device proof the listener is live.
    console.log("[audio] listening on");
    useJourney.getState().set({ sensors: { ...useJourney.getState().sensors, mic: true } });
  },
  async stop() {
    epoch++; // invalidate any start() awaiting provisioning (A1)
    kannada?.stop();
    kannada = null;
    for (const s of esrSubs) s.remove();
    esrSubs = [];
    try {
      speechRecognition?.abort();
    } catch {
      /* nothing running */
    }
    for (const s of subs) s.remove();
    subs = [];
    if (voskLoaded && vosk) {
      try {
        vosk.stop();
        vosk.unload();
      } catch {
        /* already stopped */
      }
      voskLoaded = false;
      vosk = null;
    }
    console.log("[audio] listening off"); // F9: on-device proof the listener stopped
    useJourney.getState().set({ sensors: { ...useJourney.getState().sensors, mic: false } });
  },
  transcript30s: () => rb.text(),
};
