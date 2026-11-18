import AsyncStorage from "@react-native-async-storage/async-storage";

// Fix lane R (M9): the correct word given with no network must survive the app being
// killed. The journey store is memory only, so the phone keeps this one small record
// until the request is delivered or the server refuses it. Ids and the alarm mode only:
// no word, no location. A storage failure must never touch the cancel itself.
const KEY = "vaira.cancelOffline";

// quiet: the emergency word came after it (founder Q116), so a restart stays quiet.
export type OfflineCancel = { id: string; owner_id: string; alarm_mode?: "siren" | "silent"; quiet?: boolean };

export const cancelOfflineMarker = {
  async save(j: OfflineCancel): Promise<void> {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify({ id: j.id, owner_id: j.owner_id, alarm_mode: j.alarm_mode, quiet: j.quiet }));
    } catch (e) {
      console.warn("[cancelOffline] save failed", (e as Error)?.message);
    }
  },
  async read(): Promise<OfflineCancel | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return null;
      const m = JSON.parse(raw) as Partial<OfflineCancel> | null;
      if (typeof m?.id === "string" && typeof m?.owner_id === "string") return m as OfflineCancel;
    } catch (e) {
      console.warn("[cancelOffline] read failed", (e as Error)?.message);
    }
    await cancelOfflineMarker.clear();
    return null;
  },
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch (e) {
      console.warn("[cancelOffline] clear failed", (e as Error)?.message);
    }
  },
};
