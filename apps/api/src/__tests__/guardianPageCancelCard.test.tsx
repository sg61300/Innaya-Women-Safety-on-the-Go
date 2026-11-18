// ADR-043 I10: the ordinary guardian link shows the Safe / Not safe vote card.
import React from "react";
import { signGuardianToken, signCancelVoteToken, verifyCancelVoteToken } from "@/lib/token";

// react-dom ships no bundled types here; require keeps `tsc --noEmit` clean.
const { renderToStaticMarkup }: { renderToStaticMarkup: (el: React.ReactElement) => string } = require("react-dom/server");

// Keep the page isolated: stub the heavy live-status subtree, keep the real card.
jest.mock("@/app/g/[token]/GuardianStatus", () => ({
  GuardianStatus: ({ data }: { data: { archived: boolean } }) => React.createElement("div", { id: "status", "data-archived": String(data.archived) }),
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

// G7 (founder Q100; grey is the disclosed reading): past the window + 5 min Safe is greyed.
test("G7: the Safe button is live inside the window and disabled after it", () => {
  const { CancelRequestCard } = require("@/app/g/[token]/CancelRequestCard");
  const props = { requestId: "r1", method: "word", mediaUrl: null, voteToken: "t", resolved: false, verdict: null };
  const safeButton = (html: string) => html.slice(0, html.indexOf("Safe — cancel the alarm")).split("<button").pop() as string;
  expect(safeButton(renderToStaticMarkup(React.createElement(CancelRequestCard, props)))).not.toContain("disabled");
  const closed = renderToStaticMarkup(React.createElement(CancelRequestCard, { ...props, safeClosed: true }));
  expect(safeButton(closed)).toContain("disabled");
  expect(closed).toContain("Not safe — keep it on");
});

// Fix lane R, H4: an expired vote link never leaves the guardian with nothing.
describe("expired vote link", () => {
  const CLOSED = "This request has closed";
  const agedVt = (id: string, contact: string) => {
    const spy = jest.spyOn(Date, "now").mockReturnValue(Date.now() - 36 * 60_000);
    const vt = signCancelVoteToken(id, contact);
    spy.mockRestore();
    return vt;
  };

  test("the token is really dead at 36 minutes", () => {
    expect(verifyCancelVoteToken(agedVt("r0", "c1"))).toBeNull();
  });

  test("that guardian is asked now: the current card with live buttons", async () => {
    tables.cancel_requests = { ...openReq, created_at: new Date().toISOString() };
    const html = await render(signGuardianToken("j1", "c1"), "r0", agedVt("r0", "c1"));
    expect(html).toContain("Safe — cancel the alarm");
    expect(html).toMatch(/\/api\/cancel-request\/r1\/vote\?t=/);
    expect(html).not.toContain(CLOSED);
  });

  test("another group is being asked: a closed state, no buttons", async () => {
    tables.cancel_requests = { ...openReq, created_at: new Date().toISOString(), asked_contact_ids: ["c9"] };
    const html = await render(signGuardianToken("j1", "c1"), "r0", agedVt("r0", "c1"));
    expect(html).toContain(CLOSED);
    expect(html).not.toContain("Safe — cancel the alarm");
  });

  test("nothing open at all: a closed state, no buttons", async () => {
    const html = await render(signGuardianToken("j1", "c1"), "r0", agedVt("r0", "c1"));
    expect(html).toContain(CLOSED);
    expect(html).not.toContain("Not safe");
  });
});

describe("guardian page while still being asked (M2)", () => {
  const expired = () => { (tables.journeys as any).status = "expired"; };
  test("expired journey with an open request is not shown as archived", async () => {
    expired();
    tables.cancel_requests = { ...openReq, created_at: new Date().toISOString() };
    expect(await render(signGuardianToken("j1", "c1"))).toContain('data-archived="false"');
  });
  test("expired journey with nothing open is archived, as today", async () => {
    expired();
    expect(await render(signGuardianToken("j1", "c1"))).toContain('data-archived="true"');
  });
});

// Fix lane D6 (founder Q127): a cancel proof photo deleted after 30 days signs to no
// URL. The card still shows, with no broken image and no error text.
test("a cancel request whose proof photo was deleted shows the card without an image or an error", async () => {
  tables.cancel_requests = { ...openReq, method: "photo", media_path: "u1/cancel/j1/gone.jpg" };
  const html = await render(signGuardianToken("j1", "c1"));
  expect(html).toContain(CARD);
  expect(html).not.toContain("<img");
  expect(html).not.toMatch(/error|failed|could not/i);
});
