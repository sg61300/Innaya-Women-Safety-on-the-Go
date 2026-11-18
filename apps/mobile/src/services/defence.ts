import seed from "../data/defence.seed.json";

export type Pt = { lat: number; lng: number };
export type DefenceClass = Pt & { name: string; partner: boolean; discountPct?: number; phone: string };
export type DefenceTool = { name: string; legal: "legal" | "restricted"; amazonUrl: string; note?: string };

// Task 23 owns the canonical haversineM (src/services/journey.ts) which this
// module is specified to consume; that lane has not merged yet, so defence ships
// a local great-circle metre distance and swaps to the shared one when it lands.
export function haversineM(a: Pt, b: Pt): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function sortByDistance<T extends Pt>(items: T[], origin: Pt): (T & { distanceM: number })[] {
  return items.map((i) => ({ ...i, distanceM: haversineM(i, origin) })).sort((a, b) => a.distanceM - b.distanceM);
}

export const defence = {
  // Places search is Day 3+; classes come from the seed for the pilot.
  classes: (lat: number, lng: number) => sortByDistance(seed.classes as DefenceClass[], { lat, lng }),
  tools: () => seed.tools as DefenceTool[],
};
