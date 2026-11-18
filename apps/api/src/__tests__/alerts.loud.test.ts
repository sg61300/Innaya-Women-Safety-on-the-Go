// R43/T2: EMERGENCY/CRITICAL pushes for guardians with loud_override go to the
// DnD-bypassing vaira-alarm-2 channel with the siren sound; everyone else and every
// other state keeps the default vaira-alerts / default sound.
let mockTables: Record<string, any> = {};
const builder = (result: any) => {
  const b: any = {
    select: () => b,
    eq: () => b,
    in: () => b,
    single: () => Promise.resolve({ data: result }),
    insert: () => Promise.resolve({ error: null }),
    then: (resolve: (v: any) => void) => resolve({ data: result }),
  };
  return b;
};
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({ from: (t: string) => builder(mockTables[t]) }) }));
jest.mock("@/lib/token", () => ({ signGuardianToken: () => "sig" }));
jest.mock("nodemailer", () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({}) })) }));

import { notifyGuardians } from "@/lib/alerts";

beforeAll(() => {
  process.env.GMAIL_SMTP_USER = "support@example.com";
  process.env.GMAIL_SMTP_PASS = "test-password";
  process.env.APP_BASE_URL = "https://vaira.app";
  process.env.GUARDIAN_LINK_SECRET = "test-secret";
});

const bodies = (m: jest.SpyInstance) =>
  m.mock.calls.map((c) => JSON.parse((c[1] as any).body as string));

afterEach(() => jest.restoreAllMocks());

test("CRITICAL: loud token via vaira-alarm-2+siren, normal token via default", async () => {
  mockTables = {
    journeys: { owner_id: "o1", from_label: "A", to_label: "B" },
    contacts: [
      { id: "c1", email: "l@x", linked_user_id: "u_loud", tier: "primary" },
      { id: "c2", email: "n@x", linked_user_id: "u_norm", tier: "primary" },
    ],
    monitoring_assignments: [],
    profiles: [
      { expo_push_token: "TOK_LOUD", loud_override: true },
      { expo_push_token: "TOK_NORM", loud_override: false },
    ],
  };
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  await notifyGuardians("j1", "CRITICAL", "t", "b");

  expect(fetchMock).toHaveBeenCalledTimes(2);
  const msgs = bodies(fetchMock).map((arr) => arr[0]);
  const loud = msgs.find((m: any) => m.to === "TOK_LOUD");
  const norm = msgs.find((m: any) => m.to === "TOK_NORM");
  expect(loud).toMatchObject({ channelId: "vaira-alarm-2", sound: "siren.mp3" });
  expect(norm).toMatchObject({ channelId: "vaira-alerts", sound: "default" });
});

test("EMERGENCY: loud token also routes to the -2 DnD-bypassing channel", async () => {
  mockTables = {
    journeys: { owner_id: "o1", from_label: "A", to_label: "B" },
    contacts: [{ id: "c1", email: "l@x", linked_user_id: "u_loud", tier: "primary" }],
    monitoring_assignments: [],
    profiles: [{ expo_push_token: "TOK_LOUD", loud_override: true }],
  };
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  await notifyGuardians("j1", "EMERGENCY", "t", "b");
  expect(bodies(fetchMock)[0][0]).toMatchObject({ channelId: "vaira-alarm-2", sound: "siren.mp3" });
});

test("AMBER: one default fetch even when the guardian has loud_override", async () => {
  mockTables = {
    journeys: { owner_id: "o1", from_label: "A", to_label: "B" },
    contacts: [{ id: "c1", email: "l@x", linked_user_id: "u_loud", tier: "primary" }],
    monitoring_assignments: [{ contact_id: "c1" }],
    profiles: [{ expo_push_token: "TOK_LOUD", loud_override: true }],
  };
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  await notifyGuardians("j1", "AMBER", "t", "b");

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(bodies(fetchMock)[0][0]).toMatchObject({ channelId: "vaira-alerts", sound: "default" });
});

test("no push tokens → no fetch", async () => {
  mockTables = {
    journeys: { owner_id: "o1", from_label: "A", to_label: "B" },
    contacts: [{ id: "c1", email: "e@x", linked_user_id: null, tier: "primary" }],
    monitoring_assignments: [],
    profiles: [],
  };
  const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  await notifyGuardians("j1", "CRITICAL", "t", "b");
  expect(fetchMock).not.toHaveBeenCalled();
});
