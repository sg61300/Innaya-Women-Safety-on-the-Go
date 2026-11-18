import type { LatLng } from "@vaira/core";
import { supabase } from "./supabase";

// Keep release builds usable when a CI environment variable is missing or has
// an accidental trailing slash/path prefix. CI overrides this public fallback
// whenever EXPO_PUBLIC_API_URL is configured.
const DEFAULT_API_BASE_URL = "https://innaya-api.example.com";

export function apiUrl(path: string): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  const base = (configured || DEFAULT_API_BASE_URL)
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}

// Owner 2026-11-12: a request that hangs is cut off after this long, so callers (the alarm event
// queue first of all) can retry instead of waiting on the phone's own network timeout.
export const API_TIMEOUT_MS = 20_000;
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function get<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetchWithTimeout(apiUrl(path), {
    headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

export interface RouteResult { polyline: LatLng[]; durationSec: number; durationInTrafficSec: number | null; distanceM: number }

// ADR-040 Directions proxy: GET /api/places/route (429 when called more than once
// per 60 s per journey, 503 if unconfigured — both surface here as a thrown Error).
export async function fetchRoute(journeyId: string, origin: LatLng, dest: LatLng): Promise<RouteResult> {
  return get<RouteResult>(
    `/api/places/route?journeyId=${encodeURIComponent(journeyId)}&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}`
  );
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetchWithTimeout(apiUrl(path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}
