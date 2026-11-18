import { GET } from "@/app/api/monitoring/route";

jest.mock("@/lib/auth", () => ({ requireUser: jest.fn().mockResolvedValue({ id: "guardian-1" }) }));

const rows: Record<string, unknown> = {
  journeys: { from_label: "Home", to_label: "Work", status: "monitoring", profiles: { name: "Asha", phone: "999" } },
  journey_state: { state: "SAFE", changed_at: "2026-09-09T10:00:00.000Z" },
  locations: { lat: 12.9, lng: 77.6, ts: "2026-09-09T10:00:00.000Z" },
  heartbeats: { battery: 0.8, ts: "2026-09-09T10:00:00.000Z" },
  events: { frame_url: "j1/frame.jpg", payload: { path: "j1/payload.jpg" }, ts: "2026-09-09T10:00:00.000Z" },
};
const signed = jest.fn(async (path: string) => ({ data: { signedUrl: `https://storage.test/${path}` } }));

jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    rpc: async () => ({ data: true }),
    from: (table: string) => {
      const value = rows[table];
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        single: async () => ({ data: value }),
        maybeSingle: async () => ({ data: value }),
      };
      return builder;
    },
    storage: { from: () => ({ createSignedUrl: signed }) },
  }),
}));

const request = () => new Request("https://vaira.test/api/monitoring?journeyId=j1", { headers: { authorization: "Bearer t" } });

beforeEach(() => {
  rows.journeys = { from_label: "Home", to_label: "Work", status: "monitoring", profiles: { name: "Asha", phone: "999" } };
  rows.journey_state = { state: "SAFE", changed_at: "2026-09-09T10:00:00.000Z" };
  signed.mockClear();
});

test("snapshot keeps frames private outside an alarm", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect((await response.json()).frame).toBeNull();
  expect(signed).not.toHaveBeenCalled();
});

test("snapshot signs the schema frame_url only during an alarm", async () => {
  rows.journey_state = { state: "CRITICAL", changed_at: "2026-09-09T10:00:00.000Z" };
  const response = await GET(request());
  expect((await response.json()).frame).toEqual({ url: "https://storage.test/j1/frame.jpg", ts: "2026-09-09T10:00:00.000Z" });
  expect(signed).toHaveBeenCalledWith("j1/frame.jpg", 300);
});

test("snapshot signs the mobile payload path during an alarm", async () => {
  rows.journey_state = { state: "CRITICAL", changed_at: "2026-09-09T10:00:00.000Z" };
  rows.events = { frame_url: null, payload: { path: "j1/mobile-frame.jpg" }, ts: "2026-09-09T10:00:00.000Z" };
  const response = await GET(request());
  expect((await response.json()).frame).toEqual({ url: "https://storage.test/j1/mobile-frame.jpg", ts: "2026-09-09T10:00:00.000Z" });
  expect(signed).toHaveBeenCalledWith("j1/mobile-frame.jpg", 300);
});
