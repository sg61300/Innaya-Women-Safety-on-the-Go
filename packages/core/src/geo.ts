export interface LatLng { lat: number; lng: number }
const R = 6_371_000, rad = (d: number) => (d * Math.PI) / 180;
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Equirectangular projection around p (fine below a few km) → point-to-segment distance.
export function distanceToPolylineM(p: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return haversineM(p, line[0]);
  const k = Math.cos(rad(p.lat));
  const proj = (q: LatLng) => ({ x: rad(q.lng - p.lng) * k * R, y: rad(q.lat - p.lat) * R });
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = proj(line[i - 1]), b = proj(line[i]);
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-(a.x * dx + a.y * dy)) / len2));
    const d = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (d < best) best = d;
  }
  return best;
}
