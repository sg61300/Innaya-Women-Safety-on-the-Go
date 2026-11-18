import { profileSchema, type ProfileInput } from "@vaira/core";
import { supabase } from "../lib/supabase";

// Persist the setup profile: one upsert on `profiles`, then a replace of the
// user's `contacts` rows that never leaves them empty (FD2). We upsert on
// (owner_id,phone) — so unchanged contacts are updated in place, keeping their
// id/linked_user_id/status — then delete only rows whose phone is no longer in
// the list. Positions restart per tier so primary and buffer lists are each
// 0-indexed (matches the UX ordering and the DB `position` column).
export async function saveProfile(userId: string, input: ProfileInput) {
  const p = profileSchema.parse(input);
  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    name: p.name,
    age: p.age,
    occupation: p.occupation,
    company: p.company ?? null,
    how_heard: p.howHeard ?? null,
    self_defence_training: p.selfDefence ?? {},
    tools: p.tools ?? [],
  });
  if (error) throw error;
  let pi = 0,
    bi = 0;
  const rows = p.contacts.map((c) => ({
    owner_id: userId,
    name: c.name,
    phone: c.phone,
    email: c.email || null,
    tier: c.tier,
    position: c.tier === "primary" ? pi++ : bi++,
  }));
  const { error: e2 } = await supabase
    .from("contacts")
    .upsert(rows, { onConflict: "owner_id,phone" });
  if (e2) throw e2;
  // Prune contacts the user removed: delete rows whose phone is not in the new
  // list (or every row when the list is empty). Runs after the upsert so a kept
  // contact is never deleted before its replacement exists.
  const phones = rows.map((r) => r.phone);
  const prune = supabase.from("contacts").delete().eq("owner_id", userId);
  const { error: e3 } = await (phones.length
    ? prune.not("phone", "in", `(${phones.join(",")})`)
    : prune);
  if (e3) throw e3;
}
