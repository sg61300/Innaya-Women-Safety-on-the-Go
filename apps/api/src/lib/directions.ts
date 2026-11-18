export interface RouteResult { polyline: { lat: number; lng: number }[]; durationSec: number; durationInTrafficSec: number | null; distanceM: number }
export function decodePolyline(str: string) {
  const out: { lat: number; lng: number }[] = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of ["lat", "lng"] as const) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === "lat") lat += d; else lng += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}
export function parseDirections(json: any): RouteResult | null {
  const r = json?.routes?.[0]; if (json?.status !== "OK" || !r) return null;
  const legs = r.legs ?? [];
  const sum = (f: (l: any) => number | undefined) => legs.reduce((a: number, l: any) => a + (f(l) ?? 0), 0);
  const traffic = legs.every((l: any) => l.duration_in_traffic?.value != null) ? sum((l) => l.duration_in_traffic.value) : null;
  return { polyline: decodePolyline(r.overview_polyline?.points ?? ""), durationSec: sum((l) => l.duration?.value), durationInTrafficSec: traffic, distanceM: sum((l) => l.distance?.value) };
}
const last = new Map<string, number>();
export function allowRoute(journeyId: string, now = Date.now()): boolean {
  const t = last.get(journeyId); if (t !== undefined && now - t < 60_000) return false; last.set(journeyId, now); return true;
}
