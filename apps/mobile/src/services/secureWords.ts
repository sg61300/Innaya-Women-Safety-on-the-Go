import * as SecureStore from "expo-secure-store";
import { hashWord, isGuessableSafeWord } from "@vaira/core";
import { supabase } from "../lib/supabase";

type Kind = "emergency" | "police_keyword" | "are_you_safe";
const journeyWordKey = (journeyId: string) => `vaira.journey.safe_word.${journeyId}`;

// Safety words never leave the device in plaintext: the words themselves live in
// SecureStore (`vaira.words.<kind>`), and only salted hashes are synced to the
// `safety_words` table. The emergency password is likewise stored server-side as
// a hash only.
export const secureWords = {
  async save(kind: Kind, words: string[]) {
    await SecureStore.setItemAsync(`vaira.words.${kind}`, JSON.stringify(words));
  },
  async get(kind: Kind): Promise<string[]> {
    try {
      return JSON.parse((await SecureStore.getItemAsync(`vaira.words.${kind}`)) ?? "[]");
    } catch {
      return [];
    }
  },
  async syncHashes(userId: string, salt: string, words: { emergency: string[]; police_keyword: string[] }) {
    const rows: { owner_id: string; kind: string; word_hash: string }[] = [];
    const hashesByKind: Record<string, string[]> = { emergency: [], police_keyword: [] };
    // Dedup per kind: hashWord normalises (lowercase, collapsed whitespace) so two
    // spellings of one word share a hash. Two identical conflict keys in one upsert
    // batch make Postgres raise 21000, so keep one row per hash per kind. Words are
    // passed in (not read from SecureStore) so the caller can sync before the device
    // write and never leave the server holding hashes the device does not gate on.
    for (const kind of ["emergency", "police_keyword"] as const) {
      const seen = new Set<string>();
      for (const w of words[kind]) seen.add(hashWord(w, salt));
      hashesByKind[kind] = [...seen];
      for (const word_hash of seen) rows.push({ owner_id: userId, kind, word_hash });
    }
    const { error } = await supabase.from("safety_words").upsert(rows, { onConflict: "owner_id,kind,word_hash" });
    if (error) throw error;
    // Prune hashes the user changed or deleted: for each kind, remove rows whose
    // hash is not in the freshly computed set (every row of that kind when the
    // set is empty). Runs after the upsert so a kept word is never dropped first.
    for (const kind of ["emergency", "police_keyword"] as const) {
      const keep = hashesByKind[kind];
      const prune = supabase.from("safety_words").delete().eq("owner_id", userId).eq("kind", kind);
      const { error: e } = await (keep.length ? prune.not("word_hash", "in", `(${keep.join(",")})`) : prune);
      if (e) throw e;
    }
  },
  async saveJourneySafeWord(journeyId: string, word: string) {
    await SecureStore.setItemAsync(journeyWordKey(journeyId), word);
  },
  async getJourneySafeWord(journeyId: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(journeyWordKey(journeyId));
    } catch {
      return null;
    }
  },
  // The active journey keeps its own salted safe-word hash. The local history
  // is the fast/offline path, but it can be empty after a reinstall or when a
  // journey was adopted from the server. Use the profile salt to verify the
  // current journey's exact typed word without ever downloading plaintext.
  async verifyJourneySafeWord(
    input: string,
    journey: { id?: unknown; owner_id?: unknown; are_you_safe_word_hash?: unknown } | null,
  ): Promise<boolean | null> {
    let ownerId = typeof journey?.owner_id === "string" ? journey.owner_id : "";
    let expected = typeof journey?.are_you_safe_word_hash === "string" ? journey.are_you_safe_word_hash : "";
    // A restored journey may have been populated from a reduced local shape.
    // Recover the hash by id before falling back to the legacy history path.
    if (!expected && typeof journey?.id === "string") {
      try {
        const { data, error } = await supabase
          .from("journeys")
          .select("owner_id, are_you_safe_word_hash")
          .eq("id", journey.id)
          .maybeSingle();
        if (!error && data) {
          if (!ownerId && typeof (data as { owner_id?: unknown }).owner_id === "string")
            ownerId = (data as { owner_id: string }).owner_id;
          expected = typeof (data as { are_you_safe_word_hash?: unknown }).are_you_safe_word_hash === "string"
            ? (data as { are_you_safe_word_hash: string }).are_you_safe_word_hash
            : "";
        }
      } catch {
        /* no server proof; do not confuse legacy history with this journey */
      }
    }
    if (!ownerId || !expected) return null;
    try {
      const { data, error } = await supabase.from("profiles").select("word_salt").eq("id", ownerId).maybeSingle();
      const salt = (data as { word_salt?: unknown } | null)?.word_salt;
      return !error && typeof salt === "string" && salt.length > 0 && hashWord(input, salt) === expected;
    } catch {
      return false;
    }
  },
  strength(word: string): "weak" | "ok" | "strong" {
    if (!isGuessableSafeWord(word, []).ok) return "weak";
    return word.trim().split(/\s+/).length >= 2 && word.length >= 10 ? "strong" : "ok";
  },
};
