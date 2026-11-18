// Pilot city catalogue for journey setup. Each entry carries a bounding box
// [latMin, latMax, lngMin, lngMax] so a raw GPS fix can be mapped to the city
// whose local unsafe-zone data VAIRA should load. Ghaziabad sits inside the
// wider Delhi NCR box, so it is listed BEFORE Delhi and its tighter box wins on
// a first-hit scan. `other` is the fallback and carries no box.
export type CityKey =
  | "bengaluru" | "mumbai" | "delhi" | "hyderabad" | "chennai" | "kolkata"
  | "pune" | "ghaziabad" | "ahmedabad" | "jaipur" | "surat" | "lucknow"
  | "chandigarh" | "other";

export type CityOption = {
  value: CityKey;
  label: string;
  lat: number;
  lng: number;
  box: [number, number, number, number];
};

// ±0.2° box around a centre, for the cities the brief specifies as "±0.2°".
const box = (lat: number, lng: number): [number, number, number, number] => [
  lat - 0.2, lat + 0.2, lng - 0.2, lng + 0.2,
];

export const CITY_OPTIONS: CityOption[] = [
  { value: "bengaluru", label: "Bengaluru, Karnataka", lat: 12.9716, lng: 77.5946, box: [12.8, 13.2, 77.4, 77.8] },
  { value: "mumbai", label: "Mumbai, Maharashtra", lat: 19.076, lng: 72.8777, box: [18.8, 19.4, 72.7, 73.1] },
  { value: "hyderabad", label: "Hyderabad, Telangana", lat: 17.385, lng: 78.4867, box: [17.2, 17.6, 78.2, 78.7] },
  { value: "chennai", label: "Chennai, Tamil Nadu", lat: 13.0827, lng: 80.2707, box: [12.9, 13.3, 80.1, 80.4] },
  { value: "kolkata", label: "Kolkata, West Bengal", lat: 22.5726, lng: 88.3639, box: [22.4, 22.7, 88.2, 88.5] },
  { value: "pune", label: "Pune, Maharashtra", lat: 18.5204, lng: 73.8567, box: [18.4, 18.7, 73.7, 74.1] },
  // Ghaziabad is checked BEFORE Delhi so its tighter box wins (brief).
  { value: "ghaziabad", label: "Ghaziabad, Uttar Pradesh", lat: 28.6692, lng: 77.4538, box: [28.55, 28.8, 77.3, 77.6] },
  { value: "delhi", label: "Delhi", lat: 28.6139, lng: 77.209, box: [28.4, 28.9, 76.8, 77.4] },
  { value: "ahmedabad", label: "Ahmedabad, Gujarat", lat: 23.0225, lng: 72.5714, box: box(23.0225, 72.5714) },
  { value: "jaipur", label: "Jaipur, Rajasthan", lat: 26.9124, lng: 75.7873, box: box(26.9124, 75.7873) },
  { value: "surat", label: "Surat, Gujarat", lat: 21.1702, lng: 72.8311, box: box(21.1702, 72.8311) },
  { value: "lucknow", label: "Lucknow, Uttar Pradesh", lat: 26.8467, lng: 80.9462, box: box(26.8467, 80.9462) },
  { value: "chandigarh", label: "Chandigarh", lat: 30.7333, lng: 76.7794, box: box(30.7333, 76.7794) },
  { value: "other", label: "Somewhere else", lat: 0, lng: 0, box: [0, 0, 0, 0] },
];

// First bounding-box hit wins; `other` is the fallback and is never matched by
// box (it is the catch-all when no real city box contains the coordinate).
export function cityFromCoords(lat: number, lng: number): CityKey {
  for (const c of CITY_OPTIONS) {
    if (c.value === "other") continue;
    const [latMin, latMax, lngMin, lngMax] = c.box;
    if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) return c.value;
  }
  return "other";
}
