import { proxyPlaces } from "@/lib/placesProxy";

export async function GET(req: Request) {
  return proxyPlaces(req, "https://maps.googleapis.com/maps/api/place/autocomplete/json");
}
