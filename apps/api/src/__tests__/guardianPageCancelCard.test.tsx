// ADR-043 I10: the ordinary guardian link shows the Safe / Not safe vote card.
import React from "react";
import { signGuardianToken } from "@/lib/token";

// react-dom ships no bundled types here; require keeps `tsc --noEmit` clean.
const { renderToStaticMarkup }: { renderToStaticMarkup: (el: React.ReactElement) => string } = require("react-dom/server");

// Keep the page isolated: stub the heavy live-status subtree, keep the real card.
jest.mock("@/app/g/[token]/GuardianStatus", () => ({
  GuardianStatus: () => React.createElement("div", { id: "status" }),
  LinkExpired: () => React.createElement("div", { id: "expired" }),
}));

let tables: Record<string, unknown> = {};
const builder = (table: string) => {
  const b: any = {
    select: () => b,
    eq: () => b,
    is: () => b,
    order: () => b,
    limit: () => b,
    single: async () => ({ data: tables[table] ?? null }),
    maybeSingle: async () => ({ data: tables[table] ?? null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? null }),
  };
  return b;
};
jest.mock("@/lib/supabaseAdmin", () => ({
  admin: () => ({
    from: (t: string) => builder(t),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  }),
}));

import GuardianPage from "@/app/g/[token]/page";

const render = async (token: string, cr?: string, vt?: string) =>
  renderToStaticMarkup(
    await GuardianPage({
      params: Promise.resolve({ token }),
      searchParams: Promise.resolve({ cr, vt }),
    }),
  );

const CARD = "She is asking you to confirm she is safe";
const READONLY = "Open the cancel-request message to vote";

beforeEach(() => {
  process.env.GUARDIAN_LINK_SECRET = "secret";
  tables = {
    journeys: { from_label: "Home", to_label: "Office", owner_id: "o1", status: "active", alarm_mode: "loud", profiles: {} },
    journey_state: [{ state: "CRITICAL", changed_at: "t" }],
    locations: null,
    heartbeats: null,
    events: [],
    cancel_requests: null,
  };
});

const openReq = { id: "r1", journey_id: "j1", method: "word", media_path: null, asked_contact_ids: ["c1"], verdict: null, resolved_at: null };

test("asked contact with an open request sees the vote card with buttons", async () => {
  tables.cancel_requests = openReq;
  const html = await render(signGuardianToken("j1", "c1"));
  expect(html).toContain(CARD);
  expect(html).toContain("Safe — cancel the alarm");
  expect(html).not.toContain(READONLY);
  // a vote token was minted server-side into the form action
  expect(html).toMatch(/\/api\/cancel-request\/r1\/vote\?t=/);
  // alarm live → self-refresh meta present
  expect(html).toContain('http-equiv="refresh"');
});

test("legacy journey-only link shows the card read-only", async () => {
  tables.cancel_requests = openReq;
  const html = await render(signGuardianToken("j1"));
  expect(html).toContain(CARD);
  expect(html).toContain(READONLY);
  expect(html).not.toContain("Safe — cancel the alarm");
});

test("no card when no request is open", async () => {
  tables.cancel_requests = null;
  const html = await render(signGuardianToken("j1", "c1"));
  expect(html).not.toContain(CARD);
});

test("a contact NOT in asked_contact_ids gets no card", async () => {
  tables.cancel_requests = openReq; // asks only c1
  const html = await render(signGuardianToken("j1", "c9"));
  expect(html).not.toContain(CARD);
});

test("tampered token → LinkExpired, no card, no throw", async () => {
  tables.cancel_requests = openReq;
  const html = await render(signGuardianToken("j1", "c1") + "x");
  expect(html).toContain('id="expired"');
  expect(html).not.toContain(CARD);
});

test("resolved request (no open row returned) → no card", async () => {
  tables.cancel_requests = null; // the open-request query filters resolved_at
  const html = await render(signGuardianToken("j1", "c1"));
  expect(html).not.toContain(CARD);
});

test("no self-refresh meta outside an alarm state", async () => {
  (tables.journey_state as unknown[])[0] = { state: "ACTIVE", changed_at: "t" };
  const html = await render(signGuardianToken("j1", "c1"));
  expect(html).not.toContain('http-equiv="refresh"');
});
