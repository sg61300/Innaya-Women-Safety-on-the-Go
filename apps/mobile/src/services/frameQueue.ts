// Founder Q117, Q118: photos taken with no network. A masked frame whose upload failed is
// kept in the app's private folder, uploaded when online, oldest first, once. The copy then
// waits, marked uploaded, until the trip is over and she says it may go: "we do not want
// memory to be used in users phone". Uploaded evidence stays. Never asked during a trip; a
// photo not yet uploaded is never offered. Nothing here may ever break the camera loop.
// M7: a photo the server refuses steps aside so later ones go up; after REFUSED_LIMIT refusals
// (at once for too large) it is deleted and logged. Another account's photos are not uploaded,
// counted or offered. Founder Q126: at sign-out uploaded copies go; a photo not yet uploaded
// stays in the app's private folder and goes up when its owner signs in again.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { toByteArray } from "base64-js";
import { supabase } from "../lib/supabase";
import { events } from "../lib/events";
import { useJourney } from "../store/journey";
import { useSession } from "../store/session";
import { isLive } from "./safetyMarker";

const KEY = "vaira.frameQueue";
const dir = () => `${FileSystem.documentDirectory}frame-queue/`;
// More than once, because a passing sign-in problem can look like a refusal.
const REFUSED_LIMIT = 5;

type Item = { journeyId: string; path: string; ts: number; file: string; meta: Record<string, unknown>; uploaded: boolean; ownerId?: string | null; refused?: number };

let draining: Promise<void> | null = null;
// Founder 2026-11-13: after she says Keep, ask again every 5 days (or when the next trip ends).
// The moment she said Keep is stored, so an app restart does not ask again early.
const KEPT_KEY = "vaira.frameQueue.keptAt";
export const CLEANUP_REASK_MS = 5 * 24 * 60 * 60 * 1000;
// One writer at a time: the camera adds while a drain marks.
let lock: Promise<unknown> = Promise.resolve();
const locked = <T,>(fn: () => Promise<T>): Promise<T> => {
  const p = lock.then(fn, fn);
  lock = p.catch(() => undefined);
  return p;
};
const read = async (): Promise<Item[]> => {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]") as Item[]; } catch { return []; }
};
const write = (items: Item[]) => AsyncStorage.setItem(KEY, JSON.stringify(items));
const update = (fn: (items: Item[]) => Item[]) => locked(async () => { await write(fn(await read())); });
const me = () => useSession.getState().userId;
const removeFile = (i: Item) => FileSystem.deleteAsync(i.file, { idempotent: true });

async function uploadOne(item: Item): Promise<"done" | "gone" | "stop" | "refused" | "tooLarge"> {
  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(item.file, { encoding: "base64" });
  } catch {
    console.warn("[frameQueue] copy missing", item.path);
    return "gone";
  }
  const { error } = await supabase.storage.from("frames").upload(item.path, toByteArray(base64), { contentType: "image/jpeg" });
  if (!error) return "done";
  // Already there: a run was killed after the upload and before the mark.
  const e = error as { statusCode?: string | number; message?: string };
  if (Number(e.statusCode) === 409 || /already exists|duplicate/i.test(e.message ?? "")) return "done";
  const code = Number(e.statusCode);
  console.warn("[frameQueue] upload failed", item.path, code, e.message);
  if (code === 413) return "tooLarge";
  // F5 (reading of founder decision 5): a 401/403 means her sign-in has lapsed or is missing, not
  // that the server refuses this photo. It is never counted as a refusal or dropped; the drain stops
  // and the photo uploads on a later drain, once she has signed in again. 408/429 wait as before.
  return code >= 400 && code < 500 && code !== 408 && code !== 429 && code !== 401 && code !== 403 ? "refused" : "stop";
}

export const frameQueue = {
  async add(f: { journeyId: string; path: string; ts: number; base64: string; meta: Record<string, unknown> }): Promise<void> {
    const file = `${dir()}${f.path.replace(/\//g, "_")}`;
    try {
      await FileSystem.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => undefined);
      await FileSystem.writeAsStringAsync(file, f.base64, { encoding: "base64" });
      await update((items) => [...items, { journeyId: f.journeyId, path: f.path, ts: f.ts, file, meta: f.meta, uploaded: false, ownerId: me() }]);
      console.log("[frameQueue] saved", f.path);
    } catch (e) {
      console.warn("[frameQueue] save failed", (e as Error)?.message);
      await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => undefined); // no orphan
    }
  },

  // Oldest first; stops at the first failure so order holds. Never rejects.
  drain(): Promise<void> {
    if (draining) return draining;
    draining = (async () => {
      try {
        const uid = me();
        if (!uid) return;
        const pending = (await read()).filter((i) => !i.uploaded && i.ownerId === uid).sort((a, b) => a.ts - b.ts);
        for (const item of pending) {
          const r = await uploadOne(item);
          if (r === "stop") break;
          if (r === "gone") { await update((items) => items.filter((i) => i.path !== item.path)); continue; }
          if (r === "refused" || r === "tooLarge") {
            const refused = (item.refused ?? 0) + 1;
            if (r === "tooLarge" || refused >= REFUSED_LIMIT) {
              await removeFile(item).catch(() => undefined);
              await update((items) => items.filter((i) => i.path !== item.path));
              await events.log("frame_refused_dropped", { path: item.path, refused, captured_at: new Date(item.ts).toISOString() }, item.journeyId);
            } else {
              await update((items) => items.map((i) => (i.path === item.path ? { ...i, refused } : i)));
            }
            continue;
          }
          // The event and the mark go in one write. Killed before it: the next run finds the
          // photo already there and writes both once. Killed after it: the photo is done.
          await locked(async () => {
            const marked = (await read()).map((i) => (i.path === item.path ? { ...i, uploaded: true } : i));
            await events.logWith("frame", { ...item.meta, path: item.path, captured_at: new Date(item.ts).toISOString(), offline: true }, item.journeyId, [[KEY, JSON.stringify(marked)]]);
          });
        }
        if (pending.length) await events.flush().catch(() => undefined);
        await frameQueue.offerCleanup();
      } catch (e) {
        console.warn("[frameQueue] drain failed", (e as Error)?.message);
      } finally {
        draining = null;
      }
    })();
    return draining;
  },

  async counts(): Promise<{ pending: number; uploaded: number }> {
    const uid = me();
    const items = (await read()).filter((i) => i.ownerId === uid);
    return { pending: items.filter((i) => !i.uploaded).length, uploaded: items.filter((i) => i.uploaded).length };
  },

  // Raises the question only when no safety flow is live and uploaded copies exist.
  async offerCleanup(): Promise<void> {
    const s = useJourney.getState();
    if (isLive(s)) {
      await AsyncStorage.removeItem(KEPT_KEY).catch(() => undefined); // the trip's end asks afresh
      if (s.photoCleanup !== null) s.set({ photoCleanup: null });
      return;
    }
    const keptAt = Number(await AsyncStorage.getItem(KEPT_KEY).catch(() => null));
    if (keptAt > 0 && Date.now() - keptAt < CLEANUP_REASK_MS) return;
    const { uploaded } = await frameQueue.counts();
    useJourney.getState().set({ photoCleanup: uploaded > 0 ? uploaded : null });
  },

  async deleteUploaded(): Promise<void> {
    const uid = me();
    const gone: string[] = [];
    for (const i of (await read()).filter((x) => x.uploaded && x.ownerId === uid)) {
      // A file that would not delete stays listed, so it is offered again and never orphaned.
      await removeFile(i).then(() => gone.push(i.path), (e: Error) => console.warn("[frameQueue] delete failed", e?.message));
    }
    await update((items) => items.filter((i) => !gone.includes(i.path)));
    useJourney.getState().set({ photoCleanup: null });
    console.log("[frameQueue] deleted uploaded copies", gone.length);
  },

  // Sign-out (founder Q126): uploaded copies of every account go; evidence not yet uploaded
  // stays for its owner's next sign-in. drain, counts and offerCleanup already skip other accounts.
  async signOut(): Promise<void> {
    try {
      const gone: string[] = [];
      for (const i of (await read()).filter((x) => x.uploaded))
        await removeFile(i).then(() => gone.push(i.path), (e: Error) => console.warn("[frameQueue] delete failed", e?.message));
      await update((items) => items.filter((i) => !gone.includes(i.path)));
      useJourney.getState().set({ photoCleanup: null });
      console.log("[frameQueue] sign-out: uploaded copies removed", gone.length);
    } catch (e) {
      console.warn("[frameQueue] sign-out clean-up failed", (e as Error)?.message);
    }
  },

  keep(): void {
    useJourney.getState().set({ photoCleanup: null });
    void AsyncStorage.setItem(KEPT_KEY, String(Date.now())).catch((e: Error) => console.warn("[frameQueue] keep not saved", e?.message));
  },

  resetForTest(): void {
    draining = null;
  },
};
