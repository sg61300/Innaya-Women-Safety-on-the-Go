import { hashWord, isGuessableSafeWord, normalisePlate } from "@vaira/core";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import { secureWords } from "./secureWords";
import { post } from "../lib/api";
import { events } from "../lib/events";
import { TERMS_VERSION } from "../data/terms";

export type Pt = { lat: number; lng: number };

/** Coordinates accepted by the journey/geospatial storage boundary. */
export function isValidCoordinate(p: Pt | null | undefined): p is Pt {
  return Boolean(
    p &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      p.lat >= -90 &&
      p.lat <= 90 &&
      p.lng >= -180 &&
      p.lng <= 180,
  );
}

// Great-circle distance in metres (Haversine). Used for the ETA estimate below.
export function haversineM(a: Pt, b: Pt) {
  const R = 6371000,
    dLat = ((b.lat - a.lat) * Math.PI) / 180,
    dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Straight-line distance at 25 km/h, floored at 10 min so a very short trip
// still leaves a monitoring window.
export const etaSeconds = (a: Pt, b: Pt) => Math.max(600, Math.round(haversineM(a, b) / (25000 / 3600)));

export const validateSafeWord = (w: string, emergency: string[]) => isGuessableSafeWord(w, emergency);

// Is this plate on the blacklist? Normalises the plate first. Exported so the
// setup screen can gate BEFORE any journey is written (T1) — a blacklisted
// vehicle must never start a monitored journey.
export async function isBlacklisted(plate: string): Promise<boolean> {
  const { data } = await supabase
    .from("blacklisted_vehicles")
    .select("plate_norm")
    .eq("plate_norm", normalisePlate(plate))
    .maybeSingle();
  return Boolean(data);
}

// Founder Q123, Q124: a journey starts only if a guardian has an email id, so her alarm always has
// someone to ask. The email is not verified yet (planned for MVP version 2). Throws if unreadable.
export async function hasGuardianWithEmail(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("contacts").select("email").eq("owner_id", userId);
  if (error) throw error;
  return ((data ?? []) as { email: string | null }[]).some((c) => !!c.email?.trim());
}

// J2: a minimal emergency journey for an SOS raised from Home with no armed
// journey. Guardians are alerted by /api/journey-state, which needs a journey row
// that exists and is owned by the caller (RLS journeys_owner). There is no safe
// word or selfie here, so the NOT NULL columns take sentinels; origin is the last
// known fix when we have one, else a null-island placeholder (to_geo mirrors it).
// A throw (offline / RLS) propagates so the runner can keep the local alarm loud
// and flag guardiansPending. Returns the new journey id.
export async function createEmergencyJourney(userId: string): Promise<{ id: string }> {
  let pt: Pt | null = null;
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) pt = { lat: last.coords.latitude, lng: last.coords.longitude };
  } catch {
    /* no fix — an SOS must still open a journey so guardians are reached */
  }
  const geo = pt ? `POINT(${pt.lng} ${pt.lat})` : "POINT(0 0)";
  const now = new Date().toISOString();
  const { data: j, error } = await supabase
    .from("journeys")
    .insert({
      owner_id: userId,
      from_label: "SOS",
      to_label: "SOS",
      from_geo: geo,
      to_geo: geo,
      start_at: now,
      eta_seconds: 0,
      mode: "sos",
      are_you_safe_word_hash: "",
      selfie_url: "",
      status: "monitoring",
      consent_version: TERMS_VERSION,
    })
    .select("id")
    .single();
  if (error) throw error;
  await events.log("sos_journey_created", { hasFix: pt != null }, j.id);
  // Open the monitoring request so the guardian status page exists; best-effort —
  // the CRITICAL fan-out (journey-state) is what actually alerts guardians.
  await post("/api/monitoring", { action: "request", journeyId: j.id }).catch(() => {});
  return { id: j.id as string };
}

export async function createJourney(
  userId: string,
  salt: string,
  i: {
    from: Pt & { label: string };
    to: Pt & { label: string };
    startAt: Date;
    leavingNow: boolean;
    mode: string;
    plate?: string;
    safeWord: string;
    selfieUri: string;
  }
): Promise<{ id: string; dangerZone: boolean; blacklisted: boolean }> {
  // Never send NaN, infinity, or out-of-range values to PostGIS. This also
  // protects callers that receive malformed coordinates from a provider.
  if (!isValidCoordinate(i.from) || !isValidCoordinate(i.to)) {
    throw new Error("invalid_coordinates");
  }
  // Gate the safe word against the user's emergency words before writing anything.
  const v = validateSafeWord(i.safeWord, await secureWords.get("emergency"));
  if (!v.ok) throw new Error(`safe_word_${v.reason}`);

  // T5: never hash the safe word with an empty salt. The profile must carry a
  // word_salt; the screen maps this to journeyNew.createError.
  if (!salt) throw new Error("profile_salt_missing");

  const plate = i.plate ? normalisePlate(i.plate) : null;
  const blacklisted = i.plate ? await isBlacklisted(i.plate) : false;

  // A route touches a danger zone if a red region sits within 300 m of either end.
  const red = async (p: Pt) =>
    ((await supabase.rpc("regions_near", { lat: p.lat, lng: p.lng, radius_m: 300 })).data ?? []).some(
      (r: { status?: string }) => r.status === "red"
    );
  const dangerZone = (await red(i.from)) || (await red(i.to));

  // T2: store the mandatory selfie FIRST. Nothing is written to `journeys` unless
  // the selfie lands, and a failed/throwing upload never leaves a half-created row.
  // Path is time + random so a retry never collides with a previous attempt.
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error: upErr } = await supabase.storage.from("selfies").upload(path, await (await fetch(i.selfieUri)).blob(), {
    contentType: "image/jpeg",
  });
  if (upErr) throw new Error("selfie_upload_failed");

  const { data: j, error } = await supabase
    .from("journeys")
    .insert({
      owner_id: userId,
      from_label: i.from.label,
      to_label: i.to.label,
      from_geo: `POINT(${i.from.lng} ${i.from.lat})`,
      to_geo: `POINT(${i.to.lng} ${i.to.lat})`,
      start_at: (i.leavingNow ? new Date() : i.startAt).toISOString(),
      eta_seconds: etaSeconds(i.from, i.to),
      mode: i.mode,
      transport: { plate, blacklisted },
      are_you_safe_word_hash: hashWord(i.safeWord, salt),
      selfie_url: path,
      consent_version: TERMS_VERSION,
      danger_zone: dangerZone,
    })
    .select("id")
    .single();
  if (error) throw error;

  // T4: append to the ARE-YOU-SAFE history (case-insensitive, cap 20) instead of
  // overwriting it, so the "used before" hint knows every past word. Plaintext
  // never leaves the phone. Then log the event and open the monitoring request.
  const priorWords = await secureWords.get("are_you_safe");
  if (!priorWords.some((w) => w.toLowerCase() === i.safeWord.toLowerCase())) {
    await secureWords.save("are_you_safe", [...priorWords, i.safeWord].slice(-20));
  }
  // Keep the current journey's word separate from the history. History is only
  // a "used before" hint; it must never let an older journey word end this one.
  try {
    if (typeof secureWords.saveJourneySafeWord === "function") await secureWords.saveJourneySafeWord(j.id as string, i.safeWord);
  } catch (e) {
    // The server hash remains authoritative if SecureStore is unavailable; do
    // not turn a successfully-created journey into a misleading create error.
    console.warn("[journey] current safe-word cache failed", (e as Error)?.message);
  }
  await events.log("journey_created", { dangerZone, blacklisted, leavingNow: i.leavingNow }, j.id);
  await post("/api/monitoring", { action: "request", journeyId: j.id });

  return { id: j.id as string, dangerZone, blacklisted };
}
