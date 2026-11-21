// Fix lane D4 (H1, H2): what the server must hear about an alarm is saved on the phone first and
// delivered oldest first, so it survives no network and a restart, and the server sees it in
// the order she did it: alarm raised, correct word, emergency word. The server takes each of
// these more than once safely. A refusal (4xx other than 401, 408, 429) is final: retrying cannot help.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ProtocolEvent } from "@vaira/core";
import { post } from "../lib/api";
import { useJourney } from "../store/journey";
import { cancelOfflineMarker } from "./cancelOfflineMarker";

const KEY = "vaira.eventOutbox";
export const OUTBOX_RETRY_MS = 15_000;
// Owner 2026-11-12: when her sign-in cannot be renewed, retrying every 15 s cannot help; this
// slower pace keeps the event (it is never dropped) until she signs in again.
export const OUTBOX_AUTH_RETRY_MS = 60_000;

type Entry =
  | { id: string; journeyId: string; kind: "event"; event: ProtocolEvent }
  | { id: string; journeyId: string; kind: "cancel"; alarmMode?: "siren" | "silent" };
type NewEntry = { journeyId: string; kind: "event"; event: ProtocolEvent } | { journeyId: string; kind: "cancel"; alarmMode?: "siren" | "silent" };

// Lazy so the runner <-> outbox require cycle never bites at load time.
const runner = () => require("./protocolRunner").runner as { send: (e: ProtocolEvent) => Promise<void> }; // eslint-disable-line @typescript-eslint/no-require-imports

let seq = 0;
let held: string | null = null; // the runner is posting this one itself and wants the reply
let delivering: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lock: Promise<unknown> = Promise.resolve();
const locked = <T,>(fn: () => Promise<T>): Promise<T> => {
  const p = lock.then(fn, fn);
  lock = p.catch(() => undefined);
  return p;
};
// Owner 2026-11-12: a damaged queue is never silently overwritten. Its raw text is kept under its
// own key (for support to recover by hand) and logged; the queue then starts empty.
// F6: loadQueue THROWS when the read itself fails (storage unavailable), because a read error is not
// an empty queue. Only the mutations (add/remove) call it, so a read error stops a write instead of
// overwriting the real queue with nothing. A damaged (unparseable) queue is the separate case above.
const loadQueue = async (): Promise<Entry[]> => {
  let raw: string;
  try {
    raw = (await AsyncStorage.getItem(KEY)) ?? "[]";
  } catch (e) {
    console.error("[outbox] queue read failed, not overwriting", (e as Error)?.message);
    throw e;
  }
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v as Entry[];
    throw new Error("not a list");
  } catch (e) {
    console.error("[outbox] queue unreadable, kept aside", (e as Error)?.message);
    try {
      await AsyncStorage.setItem(`${KEY}.damaged.${Date.now()}`, raw);
      await AsyncStorage.removeItem(KEY);
    } catch (e2) {
      console.error("[outbox] could not keep the damaged queue aside", (e2 as Error)?.message);
    }
    return [];
  }
};
// read never rejects: readers and the deliver loop treat a read error as "nothing to do this run".
const read = async (): Promise<Entry[]> => { try { return await loadQueue(); } catch { return []; } };
const write = (items: Entry[]) => AsyncStorage.setItem(KEY, JSON.stringify(items));

const statusOf = (e: unknown) => Number(/\s(\d{3})$/.exec(String((e as Error)?.message ?? e))?.[1] ?? 0);
export const isFinalRefusal = (e: unknown) => {
  const s = statusOf(e);
  // F6: 408 (timeout) and 429 (too many requests) are transient like a network failure, so they are
  // retried, not dropped. 401 is handled apart (the sign-in is renewed). Every other 4xx is final.
  return s >= 400 && s < 500 && s !== 401 && s !== 408 && s !== 429;
};

function schedule(ms = OUTBOX_RETRY_MS) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void eventOutbox.deliver();
  }, ms);
  (timer as unknown as { unref?: () => void }).unref?.();
}

async function cancelDone(refused: boolean) {
  const s = useJourney.getState();
  s.set({ cancelOffline: false });
  if (!s.ctx.quietAlarm) await cancelOfflineMarker.clear();
  console.log("[outbox] offline cancel", refused ? "refused" : "delivered");
  // The server will not take a cancel for this journey, so the wait cannot go on honestly.
  if (refused && s.ctx.cancelWaiting) void runner().send({ type: "GUARDIAN_SAYS_WRONG" });
}

async function run() {
  let renewed = false;
  for (;;) {
    const e = (await read())[0];
    if (!e) {
      const m = await cancelOfflineMarker.read();
      if (m?.quiet) await cancelOfflineMarker.clear(); // the server now knows; it restores a restart
      return;
    }
    if (e.id === held) return;
    let refused = false;
    try {
      if (e.kind === "cancel") await post("/api/cancel-request", { journeyId: e.journeyId, method: "word", alarmMode: e.alarmMode });
      else await post("/api/journey-state", { journeyId: e.journeyId, event: e.event });
    } catch (err) {
      if (statusOf(err) === 401) {
        // Owner 2026-11-12: renew her sign-in once and send again at once; if that cannot help,
        // keep the event and try again at the slower pace.
        if (!renewed) {
          renewed = true;
          // Loaded only here, so nothing that imports the outbox pulls in the client at load time.
          const { supabase } = require("../lib/supabase") as typeof import("../lib/supabase"); // eslint-disable-line @typescript-eslint/no-require-imports
          const r = await supabase.auth.refreshSession().catch((x: unknown) => ({ error: x }));
          if (!(r as { error?: unknown }).error) continue;
          console.warn("[outbox] sign-in could not be renewed", String(((r as { error?: { message?: string } }).error)?.message ?? ""));
        }
        schedule(OUTBOX_AUTH_RETRY_MS);
        return;
      }
      if (!isFinalRefusal(err)) {
        console.warn("[outbox] not delivered, will retry", e.kind, String((err as Error)?.message ?? err));
        schedule();
        return;
      }
      refused = true;
      console.warn("[outbox] refused, dropped", e.kind, String((err as Error)?.message ?? err));
    }
    await eventOutbox.remove(e.id);
    if (e.kind === "cancel") await cancelDone(refused);
  }
}

export const eventOutbox = {
  // Saved before anything else. hold = the caller posts it now itself; call release after.
  async add(entry: NewEntry, hold = false): Promise<string> {
    const id = `${Date.now()}-${++seq}`;
    if (hold) held = id;
    try {
      await locked(async () => write([...(await loadQueue()), { ...entry, id } as Entry]));
    } catch (e) {
      console.warn("[outbox] save failed", (e as Error)?.message);
    }
    return id;
  },
  async remove(id: string): Promise<void> {
    if (held === id) held = null;
    await locked(async () => write((await loadQueue()).filter((e) => e.id !== id))).catch((e) => console.warn("[outbox] remove failed", (e as Error)?.message));
  },
  // The runner's own post failed: the timer takes over.
  release(id: string): void {
    if (held === id) held = null;
    schedule();
  },
  async hasEarlier(id: string): Promise<boolean> {
    return (await read())[0]?.id !== id;
  },
  async pending(): Promise<number> {
    return (await read()).length;
  },
  async ensureCancel(journeyId: string, alarmMode?: "siren" | "silent"): Promise<void> {
    if ((await read()).some((e) => e.kind === "cancel" && e.journeyId === journeyId)) return;
    await eventOutbox.add({ journeyId, kind: "cancel", alarmMode });
  },
  // One at a time, oldest first; stops at the first that the network would not carry.
  deliver(): Promise<void> {
    if (delivering) return delivering;
    delivering = run().catch((e) => console.warn("[outbox] deliver failed", (e as Error)?.message)).finally(() => { delivering = null; });
    return delivering;
  },
  resetForTest(): void {
    held = null;
    delivering = null;
    if (timer) clearTimeout(timer);
    timer = null;
  },
};
