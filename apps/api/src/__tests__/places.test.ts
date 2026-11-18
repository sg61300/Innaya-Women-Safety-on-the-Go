jest.mock("@/lib/auth", () => ({ requireUser: jest.fn().mockResolvedValue({ id: "u1" }) }));
import { GET as autocomplete } from "@/app/api/places/autocomplete/route";
import { allow } from "@/lib/placesProxy";

const req = (qs: string) => new Request(`http://x/api/places/autocomplete?${qs}`, { headers: { authorization: "Bearer t" } });

afterEach(() => jest.restoreAllMocks());

test("injects the server key, forwards input, and ignores a client-supplied key", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "server-secret";
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response('{"predictions":[]}', { status: 200 }));
  const res = await autocomplete(req("input=connaught&key=CLIENT_TRIES_TO_INJECT"));
  expect(res.status).toBe(200);
  const called = new URL((fetchMock.mock.calls[0][0] as URL).toString());
  expect(called.origin + called.pathname).toBe("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  expect(called.searchParams.get("input")).toBe("connaught");
  expect(called.searchParams.get("key")).toBe("server-secret");
});

test("rate limiter allows 30 requests per user per minute then blocks the 31st", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 30; i++) expect(allow("rl-user", t0 + i)).toBe(true);
  expect(allow("rl-user", t0 + 30)).toBe(false);
  // window slides: a request 60 s after the first is allowed again
  expect(allow("rl-user", t0 + 60_001)).toBe(true);
});

test("returns 503 when the server key is not configured", async () => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  const res = await autocomplete(req("input=x&_u=nokey"));
  expect(res.status).toBe(503);
});
