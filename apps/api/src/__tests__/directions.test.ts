// Authorisation double: owner_id of the looked-up journey (null = not found) and the is_active_guardian_for answer.
const mockAuthz = { owner: "u1" as string | null, guardian: false };
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: mockAuthz.owner ? { owner_id: mockAuthz.owner } : null }) }) }) }),
  rpc: async () => ({ data: mockAuthz.guardian }),
}) }));
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn().mockResolvedValue({ id: "u1" }) }));

import { decodePolyline, parseDirections, allowRoute } from "@/lib/directions";
import { GET } from "@/app/api/places/route/route";

test("decodes Google's encoded polyline", () => {
  expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }, { lat: 43.252, lng: -126.453 }]);
});
test("parses the first route's legs", () => {
  const json = { status: "OK", routes: [{ overview_polyline: { points: "_p~iF~ps|U_ulLnnqC" }, legs: [{ duration: { value: 600 }, duration_in_traffic: { value: 900 }, distance: { value: 5000 } }] }] };
  expect(parseDirections(json)).toEqual({ polyline: [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }], durationSec: 600, durationInTrafficSec: 900, distanceM: 5000 });
  expect(parseDirections({ status: "ZERO_RESULTS", routes: [] })).toBeNull();
});
test("one call per journey per 60 s", () => {
  expect(allowRoute("j1", 0)).toBe(true); expect(allowRoute("j1", 30_000)).toBe(false); expect(allowRoute("j2", 30_000)).toBe(true); expect(allowRoute("j1", 60_000)).toBe(true);
});

const get = (qs: string) => GET(new Request(`http://x/api/places/route?${qs}`, { headers: { authorization: "Bearer t" } }));

describe("GET /api/places/route", () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; delete process.env.GOOGLE_MAPS_API_KEY; });

  test("proxies to Google with departure_time=now and key, returns parsed body; 429 on a second call within 60 s", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const body = { status: "OK", routes: [{ overview_polyline: { points: "_p~iF~ps|U_ulLnnqC" }, legs: [{ duration: { value: 600 }, duration_in_traffic: { value: 900 }, distance: { value: 5000 } }] }] };
    const fetchMock = jest.fn().mockResolvedValue({ json: async () => body } as any);
    global.fetch = fetchMock as any;
    const res = await get("journeyId=j9&origin=28.6,77.2&destination=28.7,77.3");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ polyline: [{ lat: 38.5, lng: -120.2 }, { lat: 40.7, lng: -120.95 }], durationSec: 600, durationInTrafficSec: 900, distanceM: 5000 });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("departure_time=now");
    expect(url).toContain("key=k");
    const res2 = await get("journeyId=j9&origin=28.6,77.2&destination=28.7,77.3");
    expect(res2.status).toBe(429);
  });

  test("missing journeyId → 400", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const res = await get("origin=28.6,77.2&destination=28.7,77.3");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/places/route, journey authorisation (A5)", () => {
  const body = { status: "OK", routes: [{ overview_polyline: { points: "_p~iF~ps|U_ulLnnqC" }, legs: [{ duration: { value: 600 }, distance: { value: 5000 } }] }] };
  beforeEach(() => { process.env.GOOGLE_MAPS_API_KEY = "k"; global.fetch = jest.fn().mockResolvedValue({ json: async () => body } as any) as any; });
  afterEach(() => { mockAuthz.owner = "u1"; mockAuthz.guardian = false; delete process.env.GOOGLE_MAPS_API_KEY; });

  test("403 when the caller neither owns nor guards the journey; 200 once they are an active guardian", async () => {
    mockAuthz.owner = "u2";
    expect((await get("journeyId=j-auth&origin=a&destination=b")).status).toBe(403);
    mockAuthz.guardian = true;
    expect((await get("journeyId=j-auth&origin=a&destination=b")).status).toBe(200);
  });
  test("404 for an unknown journey", async () => {
    mockAuthz.owner = null;
    expect((await get("journeyId=j-none&origin=a&destination=b")).status).toBe(404);
  });
});
