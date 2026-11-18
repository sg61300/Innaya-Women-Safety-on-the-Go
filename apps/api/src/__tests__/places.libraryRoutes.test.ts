// Pre-35 item D: the react-native-google-places-autocomplete library appends
// /place/autocomplete/json and /place/details/json to the configured base URL,
// so the api exposes matching routes that forward to the same Google endpoints
// via proxyPlaces.
const proxyPlaces = jest.fn(async () => new Response("{}", { status: 200 }));
jest.mock("@/lib/placesProxy", () => ({ proxyPlaces: (...a: unknown[]) => (proxyPlaces as any)(...a) }));

import { GET as autocomplete } from "@/app/api/places/place/autocomplete/json/route";
import { GET as details } from "@/app/api/places/place/details/json/route";

afterEach(() => proxyPlaces.mockClear());

test("place/autocomplete/json forwards to the Google autocomplete endpoint", async () => {
  const req = new Request("http://x/api/places/place/autocomplete/json?input=x");
  await autocomplete(req);
  expect(proxyPlaces).toHaveBeenCalledWith(req, "https://maps.googleapis.com/maps/api/place/autocomplete/json");
});

test("place/details/json forwards to the Google details endpoint", async () => {
  const req = new Request("http://x/api/places/place/details/json?place_id=y");
  await details(req);
  expect(proxyPlaces).toHaveBeenCalledWith(req, "https://maps.googleapis.com/maps/api/place/details/json");
});
