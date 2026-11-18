// W-T2 send and W-T3 failure. A guardian with no app token gets web push, one with a
// token does not; 410/404 delete the subscription; other errors stop neither the app
// push nor the email.
const sendNotification = jest.fn();
jest.mock("web-push", () => ({ sendNotification }));
const sendMail = jest.fn().mockResolvedValue({});
jest.mock("nodemailer", () => ({ createTransport: jest.fn(() => ({ sendMail })) }));
jest.mock("@/lib/token", () => ({ signGuardianToken: (j: string, c: string) => `tok-${j}-${c}` }));
const logEvent = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/events", () => ({ logEvent }));

let tables: Record<string, any> = {};
const deleted: string[] = [];
const builder = (table: string) => {
  const b: any = {
    select: () => b,
    eq: () => b,
    in: () => b,
    single: async () => ({ data: tables[table] }),
    insert: async () => ({ error: null }),
    delete: () => ({ eq: async (_c: string, id: string) => { deleted.push(id); return { error: null }; } }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] }),
  };
  return b;
};
jest.mock("@/lib/supabaseAdmin", () => ({ admin: () => ({ from: (t: string) => builder(t) }) }));

import { notifyGuardians } from "@/lib/alerts";
import { notifyContactsWebPush } from "@/lib/webPush";

const sub = (id: string, contact_id: string) => ({ id, contact_id, endpoint: `https://fcm.googleapis.com/${id}`, p256dh: "p", auth: "a" });
const httpError = (statusCode: number) => Object.assign(new Error("push service said no"), { statusCode });
let fetchMock: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  deleted.length = 0;
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(process.env, {
    VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "https://vaira.app",
    GMAIL_SMTP_PASS: "unused", APP_BASE_URL: "https://vaira.app",
  });
  delete process.env.GMAIL_SMTP_USER;
  tables = {
    journeys: { owner_id: "o1", from_label: "A", to_label: "B" },
    contacts: [
      { id: "no-app", email: "n@x", linked_user_id: null, tier: "primary" },
      { id: "linked-no-token", email: null, linked_user_id: "u2", tier: "primary" },
      { id: "has-app", email: null, linked_user_id: "u3", tier: "primary" },
    ],
    monitoring_assignments: [],
    profiles: [
      { id: "u2", expo_push_token: null, loud_override: false },
      { id: "u3", expo_push_token: "TOK", loud_override: false },
    ],
    web_push_subscriptions: [sub("s1", "no-app"), sub("s2", "linked-no-token"), sub("s3", "has-app")],
  };
});
afterEach(() => { fetchMock.mockRestore(); errorSpy.mockRestore(); });

const pushedEndpoints = () => sendNotification.mock.calls.map((c) => c[0].endpoint);

describe("W-T2 send", () => {
  test("no app token gets web push; a guardian with a token gets the app push only", async () => {
    await notifyGuardians("j1", "CRITICAL", "Title", "Body");
    expect(pushedEndpoints().sort()).toEqual(["https://fcm.googleapis.com/s1", "https://fcm.googleapis.com/s2"]);
    const expoTargets = fetchMock.mock.calls.flatMap((c) => JSON.parse(c[1].body).map((m: any) => m.to));
    expect(expoTargets).toEqual(["TOK"]);
  });

  test("the notification carries the push title and body plus that guardian's own link, and is urgent", async () => {
    await notifyGuardians("j1", "CRITICAL", "Title", "Body");
    const call = sendNotification.mock.calls.find((c) => c[0].endpoint.endsWith("/s1"))!;
    expect(call[0].keys).toEqual({ p256dh: "p", auth: "a" });
    expect(JSON.parse(call[1])).toEqual({ title: "Title", body: "Body", url: "/g/tok-j1-no-app" });
    expect(call[2]).toMatchObject({ urgency: "high", vapidDetails: { subject: "https://vaira.app", publicKey: "pub", privateKey: "priv" } });
  });

  test("AMBER reaches only the active guardian", async () => {
    tables.monitoring_assignments = [{ contact_id: "no-app" }];
    tables.web_push_subscriptions = [sub("s1", "no-app")];
    await notifyGuardians("j1", "AMBER", "Title", "Body");
    expect(pushedEndpoints()).toEqual(["https://fcm.googleapis.com/s1"]);
  });

  test("no VAPID keys configured: nothing is sent, nothing throws, email still goes", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await notifyGuardians("j1", "CRITICAL", "Title", "Body");
    expect(sendNotification).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test("no contact ids: no send, no throw", async () => {
    await expect(notifyContactsWebPush("j1", [], "T", "B")).resolves.toEqual({ sent: [], failed: [] });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe("what it reports back (fix lane R)", () => {
  test("a contact counts as reached when at least one browser took it", async () => {
    tables.web_push_subscriptions = [sub("s1", "no-app"), sub("s2", "no-app"), sub("s3", "other")];
    sendNotification.mockImplementation(async (s: any) => {
      if (s.endpoint.endsWith("/s1") || s.endpoint.endsWith("/s3")) throw httpError(410);
      return { statusCode: 201 };
    });
    expect(await notifyContactsWebPush("j1", ["no-app", "other"], "T", "B")).toEqual({ sent: ["no-app"], failed: [] });
  });
});

describe("W-T3 failure", () => {
  test.each([410, 404])("%i deletes only that subscription", async (status) => {
    sendNotification.mockImplementation(async (s: any) => {
      if (s.endpoint.endsWith("/s1")) throw httpError(status);
      return { statusCode: 201 };
    });
    await notifyGuardians("j1", "CRITICAL", "Title", "Body");
    expect(deleted).toEqual(["s1"]);
    expect(logEvent).not.toHaveBeenCalled();
  });

  test.each([
    ["500 from the push service", () => httpError(500)],
    ["a network error", () => new Error("socket hang up")],
  ])("%s keeps the subscription, is logged, and stops neither push nor email", async (_n, err) => {
    sendNotification.mockImplementation(async () => { throw (err as () => Error)(); });
    await notifyGuardians("j1", "CRITICAL", "Title", "Body");
    expect(deleted).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ journeyId: "j1", type: "alert_failed", payload: expect.objectContaining({ fanout: "web_push", failed: 2 }) }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test("the failure log never holds the endpoint or keys", async () => {
    sendNotification.mockImplementation(async () => { throw httpError(500); });
    await notifyGuardians("j1", "CRITICAL", "Title", "Body");
    const logged = JSON.stringify([errorSpy.mock.calls, logEvent.mock.calls]);
    expect(logged).not.toContain("fcm.googleapis.com");
  });

  test("the logger itself failing still never throws", async () => {
    sendNotification.mockImplementation(async () => { throw httpError(500); });
    logEvent.mockRejectedValueOnce(new Error("db down"));
    await expect(notifyContactsWebPush("j1", ["no-app"], "T", "B")).resolves.toEqual({ sent: [], failed: ["no-app", "linked-no-token"] });
  });

  test("an app push failure does not stop the web push", async () => {
    fetchMock.mockRejectedValue(new Error("expo down"));
    await expect(notifyGuardians("j1", "CRITICAL", "Title", "Body")).rejects.toThrow("expo down");
    expect(sendNotification).toHaveBeenCalled();
  });
});

test("M8 a caller can add a guardian's own vote link to the notification", async () => {
  await notifyContactsWebPush("j1", ["no-app"], "T", "B", (id) => `?cr=r1&vt=${id}`);
  expect(JSON.parse(sendNotification.mock.calls[0][1]).url).toBe("/g/tok-j1-no-app?cr=r1&vt=no-app");
});
