import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { useSession } from "../store/session";
import { analytics } from "./analytics";

const KEY = "vaira.events.queue";
type Row = { journey_id: string | null; user_id: string | null; type: string; payload: unknown; ts: string };

async function read(): Promise<Row[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
  } catch {
    return [];
  }
}

// One writer at a time: log and flush both read, change and write the whole queue, so without
// this one can undo the other and an event is lost or sent twice.
let lock: Promise<unknown> = Promise.resolve();
const locked = <T,>(fn: () => Promise<T>): Promise<T> => {
  const p = lock.then(fn, fn);
  lock = p.catch(() => undefined);
  return p;
};
let flushing: Promise<void> | null = null;

// extra: other keys saved in the same single write as the event, so a crash leaves both or neither.
async function append(type: string, payload: unknown, journeyId: string | null, extra: [string, string][]) {
  // Stamp the signed-in user so funnel events with no journey (signup, regions,
  // go-live, tools, classes) can still be attributed per user for the weekly
  // metrics. Read once from the session store, synchronous and offline-safe.
  const userId = useSession.getState().userId;
  await locked(async () => {
    const q = await read();
    q.push({ journey_id: journeyId, user_id: userId, type, payload, ts: new Date().toISOString() });
    if (extra.length) await AsyncStorage.multiSet([[KEY, JSON.stringify(q)], ...extra]);
    else await AsyncStorage.setItem(KEY, JSON.stringify(q));
  });
  // Mirror funnel taxonomy events to Mixpanel (no-op until the SDK + token are
  // present). Runtime events are filtered out inside analytics.
  analytics.track(type, payload, userId);
  console.log("[event]", type, journeyId ?? "", userId ?? "", JSON.stringify(payload).slice(0, 200));
}

export const events = {
  log(type: string, payload: unknown = {}, journeyId: string | null = null) {
    return append(type, payload, journeyId, []);
  },
  logWith(type: string, payload: unknown, journeyId: string | null, extra: [string, string][]) {
    return append(type, payload, journeyId, extra);
  },
  // Sends what is queued now; what is logged meanwhile stays for the next flush.
  flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = (async () => {
      const q = await locked(read);
      if (!q.length) return;
      const { error } = await supabase.from("events").insert(q);
      if (error) {
        console.warn("[events] flush failed, kept", q.length, error.message);
        return;
      }
      await locked(async () => AsyncStorage.setItem(KEY, JSON.stringify((await read()).slice(q.length))));
    })().finally(() => { flushing = null; });
    return flushing;
  },
};
