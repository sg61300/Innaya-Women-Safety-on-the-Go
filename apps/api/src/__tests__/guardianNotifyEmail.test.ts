const sendMail = jest.fn().mockResolvedValue({ messageId: "test-message" });
const createTransport = jest.fn(() => ({ sendMail }));
let tables: Record<string, any> = {};

const builder = (table: string) => {
  const b: any = {
    select: () => b,
    eq: () => b,
    in: () => b,
    single: () => Promise.resolve({ data: tables[table] }),
    insert: jest.fn(async () => ({ error: null })),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: tables[table] }),
  };
  return b;
};

jest.mock("nodemailer", () => ({ createTransport }));
jest.mock("@/lib/token", () => ({ signGuardianToken: () => "signed-token" }));
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({ from: (table: string) => builder(table) }) }));

import { notifyGuardians } from "@/lib/alerts";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GMAIL_SMTP_USER = "support@example.com";
  process.env.GMAIL_SMTP_PASS = "test-password";
  process.env.APP_BASE_URL = "https://vaira.app";
  tables = {
    journeys: { owner_id: "owner-1", from_label: "Home", to_label: "Office" },
    contacts: [
      { id: "active", email: "active@example.com", linked_user_id: null, tier: "primary" },
      { id: "inactive", email: "inactive@example.com", linked_user_id: null, tier: "primary" },
      { id: "no-email", email: null, linked_user_id: null, tier: "primary" },
    ],
    monitoring_assignments: [{ contact_id: "active", active: true }],
    profiles: [],
  };
});

test("sends a per-contact signed guardian link only to active AMBER contacts", async () => {
  await notifyGuardians("journey-1", "AMBER", "Possible distress", "Please check on her.");

  // I10: one email per recipient, each carrying that contact's own link.
  expect(sendMail).toHaveBeenCalledTimes(1);
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: "INNAYA <support@example.com>",
    to: ["active@example.com"],
    subject: "Possible distress",
    html: expect.stringContaining("https://vaira.app/g/signed-token"),
  }));
});

test("sends a per-contact signed guardian link to every email contact for CRITICAL", async () => {
  await notifyGuardians("journey-1", "CRITICAL", "Urgent", "Act now.");

  // active + inactive have emails; no-email is skipped → two separate emails.
  expect(sendMail).toHaveBeenCalledTimes(2);
  const recipients = sendMail.mock.calls.map((c) => c[0].to);
  expect(recipients).toEqual([["active@example.com"], ["inactive@example.com"]]);
  for (const call of sendMail.mock.calls)
    expect(call[0].html).toContain("https://vaira.app/g/signed-token");
});
