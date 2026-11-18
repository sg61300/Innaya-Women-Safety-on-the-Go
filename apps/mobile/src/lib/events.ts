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

export const events = {
  async log(type: string, payload: unknown = {}, journeyId: string | null = null) {
    const q = await read();
    // Stamp the signed-in user so funnel events with no journey (signup, regions,
    // go-live, tools, classes) can still be attributed per user for the weekly
    // metrics. Read once from the session store, synchronous and offline-safe.
    const userId = useSession.getState().userId;
    q.push({ journey_id: journeyId, user_id: userId, type, payload, ts: new Date().toISOString() });
    await AsyncStorage.setItem(KEY, JSON.stringify(q));
    // Mirror funnel taxonomy events to Mixpanel (no-op until the SDK + token are
    // present). Runtime events are filtered out inside analytics.
    analytics.track(type, payload, userId);
    console.log("[event]", type, journeyId ?? "", userId ?? "", JSON.stringify(payload).slice(0, 200));
  },
  async flush() {
    const q = await read();
    if (!q.length) return;
    const { error } = await supabase.from("events").insert(q);
    if (!error) await AsyncStorage.setItem(KEY, "[]");
    else console.warn("[events] flush failed, kept", q.length, error.message);
  },
};
