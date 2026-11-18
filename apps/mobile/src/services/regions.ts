import { supabase } from "../lib/supabase";
import { events } from "../lib/events";

export type RegionStatus = "red" | "amber" | "safe_by_police";
export type Region = {
  id: string;
  name: string | null;
  city: string;
  status: RegionStatus;
  report_count: number;
  police_status?: string;
  centroid?: unknown;
  radius_m: number;
  // Generated from centroid by 0014_regions_latlng.sql (both regions_near and
  // select('*') carry them); absent only if the migration has not been applied.
  lat?: number;
  lng?: number;
};
export type Report = { reason: string; details?: string | null; time_of_day?: string | null; ts?: string };
// F12: a user's own report with the embedded area it belongs to.
export type MyReport = {
  reason: string;
  time_of_day?: string | null;
  ts?: string;
  region: { name: string | null; status: RegionStatus; lat: number | null; lng: number | null } | null;
};

// Fill colours are the UX spec §3.16 values; safe_by_police draws a dashed
// outline. amber and red are solid. 0.35 alpha reads over the map tiles.
export const regionColour = (s: string) =>
  s === "red"
    ? { fill: "rgba(193,18,31,0.35)", dashed: false }
    : { fill: "rgba(242,201,76,0.35)", dashed: s === "safe_by_police" };

// Pilot city centres. The screen builds its city chips from this list; the
// service uses them to bucket a fresh report into a city so the chips filter it
// correctly (unsafe_regions.city is `not null default 'Delhi'` — 0001_init.sql).
export const CITY_CENTRES: { key: string; centre: { latitude: number; longitude: number } }[] = [
  { key: "Delhi", centre: { latitude: 28.6139, longitude: 77.209 } },
  { key: "Ghaziabad", centre: { latitude: 28.6692, longitude: 77.4538 } },
  { key: "Bengaluru", centre: { latitude: 12.9716, longitude: 77.5946 } },
];

// Nearest pilot-city centre within 50 km by haversine, else "Other". Local
// haversine (lane C's lib/cities.ts is not on this branch).
export const nearestCity = (lat: number, lng: number): string => {
  const R = 6371; // km
  const rad = (d: number) => (d * Math.PI) / 180;
  let best = "Other";
  let bestKm = 50;
  for (const { key, centre } of CITY_CENTRES) {
    const dLat = rad(centre.latitude - lat);
    const dLng = rad(centre.longitude - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(centre.latitude)) * Math.sin(dLng / 2) ** 2;
    const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    if (km < bestKm) { bestKm = km; best = key; }
  }
  return best;
};

export const histogram = (rs: { reason: string }[]) =>
  rs.reduce<Record<string, number>>((h, r) => ({ ...h, [r.reason]: (h[r.reason] ?? 0) + 1 }), {});

export const regions = {
  near: async (lat: number, lng: number, radius_m = 4370): Promise<Region[]> =>
    ((await supabase.rpc("regions_near", { lat, lng, radius_m })).data as Region[]) ?? [],

  // Reuse a region within 150 m, else insert a fresh amber region; then insert
  // the report. The DB trigger flips the region red past 5 distinct reporters.
  async report(
    i: { lat: number; lng: number; radiusM: number; reason: string; details?: string; timeOfDay?: string; photoUrl?: string },
    userId: string
  ): Promise<string> {
    const existing = (((await supabase.rpc("regions_near", { lat: i.lat, lng: i.lng, radius_m: 150 })).data as Region[]) ?? [])[0];
    const created = !existing;
    let regionId = existing?.id;
    if (!regionId) {
      const { data } = await supabase
        .from("unsafe_regions")
        .insert({ centroid: `POINT(${i.lng} ${i.lat})`, radius_m: i.radiusM, city: nearestCity(i.lat, i.lng) })
        .select("id")
        .single();
      regionId = (data as { id: string }).id;
    }
    try {
      const { error } = await supabase.from("unsafe_reports").insert({
        region_id: regionId,
        reporter_id: userId,
        reason: i.reason,
        details: i.details ?? null,
        time_of_day: i.timeOfDay ?? null,
        photo_url: i.photoUrl ?? null,
      });
      if (error) throw error;
    } catch (e) {
      // Roll back an amber region we just created so a failed report never leaves
      // an orphan zone on the map; a pre-existing region is left untouched.
      if (created && regionId) {
        try { await supabase.from("unsafe_regions").delete().eq("id", regionId); } catch { /* best effort */ }
      }
      throw e;
    }
    await events.log("region_report", { regionId, reason: i.reason });
    return regionId!;
  },

  // F12 (b16): the signed-in user's own reports, newest first. RLS on
  // unsafe_reports restricts the rows to reporter_id = auth.uid(); the region is
  // embedded so the list can show the area name, coordinates and current status.
  async myReports(userId: string): Promise<MyReport[]> {
    const { data } = await supabase
      .from("unsafe_reports")
      .select("reason, time_of_day, ts, region:unsafe_regions(name, status, lat, lng)")
      .eq("reporter_id", userId)
      .order("ts", { ascending: false });
    return ((data as unknown) as MyReport[]) ?? [];
  },

  async detail(id: string) {
    const [{ data: r }, { data: reports }] = await Promise.all([
      supabase.from("unsafe_regions").select("*").eq("id", id).single(),
      supabase.from("unsafe_reports").select("reason, details, time_of_day, ts").eq("region_id", id).order("ts", { ascending: false }),
    ]);
    const list = (reports as Report[]) ?? [];
    return { region: r as Region | null, reports: list, histogram: histogram(list) };
  },
};

export const REASON_KEYS = ["harassment", "stalking", "poorLighting", "isolated", "drunkCrowds", "pastIncident", "other"] as const;
export const TIME_KEYS = ["morning", "afternoon", "evening", "night"] as const;
