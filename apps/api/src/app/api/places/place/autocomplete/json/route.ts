import { proxyPlaces } from "@/lib/placesProxy";

// Pre-35 item D: the react-native-google-places-autocomplete library builds
// `${base}/place/autocomplete/json?…`, so the phone points its base at
// /api/places and this route forwards to the Google autocomplete endpoint.
export async function GET(req: Request) {
  return proxyPlaces(req, "https://maps.googleapis.com/maps/api/place/autocomplete/json");
}
