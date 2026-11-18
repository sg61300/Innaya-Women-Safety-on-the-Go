// Verifies the client-side Mixpanel mirror (src/lib/analytics.ts) against the
// mocked mixpanel-react-native SDK. The module keeps one-shot state (`tried`,
// `mp`), so each case loads a fresh copy via resetModules + doMock and controls
// EXPO_PUBLIC_MIXPANEL_TOKEN before the first client() call.

type Spies = {
  ctor: jest.Mock;
  init: jest.Mock;
  track: jest.Mock;
  identify: jest.Mock;
};

function load(token?: string): { analytics: { track: (t: string, p: unknown, u: string | null) => void }; spies: Spies } {
  jest.resetModules();
  if (token === undefined) delete process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
  else process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = token;

  const spies: Spies = { ctor: jest.fn(), init: jest.fn(), track: jest.fn(), identify: jest.fn() };
  jest.doMock("mixpanel-react-native", () => ({
    Mixpanel: class {
      constructor(t: string, autoEvents: boolean) {
        spies.ctor(t, autoEvents);
      }
      init() {
        spies.init();
        return Promise.resolve();
      }
      track(name: string, props?: unknown) {
        spies.track(name, props);
      }
      identify(id: string) {
        spies.identify(id);
        return Promise.resolve();
      }
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { analytics } = require("../analytics");
  return { analytics, spies };
}

afterEach(() => {
  jest.resetModules();
  delete process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
});

test("no token: no-op and the SDK is never required (constructor never runs)", () => {
  const { analytics, spies } = load(undefined);
  analytics.track("signup_completed", { a: 1 }, "user-1");
  analytics.track("journey_completed", {}, "user-1");
  expect(spies.ctor).not.toHaveBeenCalled();
  expect(spies.init).not.toHaveBeenCalled();
  expect(spies.track).not.toHaveBeenCalled();
  expect(spies.identify).not.toHaveBeenCalled();
});

test("token set: init exactly once across many events, track gets name + props", () => {
  const { analytics, spies } = load("tok-123");
  analytics.track("signup_completed", { plan: "free" }, null);
  analytics.track("regions_opened", { city: "pune" }, null);
  // client() is cached: constructor + init run once, not per event.
  expect(spies.ctor).toHaveBeenCalledTimes(1);
  expect(spies.ctor).toHaveBeenCalledWith("tok-123", true);
  expect(spies.init).toHaveBeenCalledTimes(1);
  expect(spies.track).toHaveBeenCalledTimes(2);
  expect(spies.track).toHaveBeenNthCalledWith(1, "signup_completed", { plan: "free" });
  expect(spies.track).toHaveBeenNthCalledWith(2, "regions_opened", { city: "pune" });
});

test("high-frequency + non-taxonomy events stay excluded (allowlist), SDK not touched", () => {
  const { analytics, spies } = load("tok-123");
  for (const t of ["frame", "keyword", "heartbeat", "protocol_event", "random_event"]) {
    analytics.track(t, { x: 1 }, "user-1");
  }
  expect(spies.ctor).not.toHaveBeenCalled();
  expect(spies.track).not.toHaveBeenCalled();
});

test("identify fires with the signed-in user on login, and is skipped when anonymous", () => {
  const withUser = load("tok-123");
  withUser.analytics.track("tool_clicked", { name: "spray", legal: true }, "user-77");
  expect(withUser.spies.identify).toHaveBeenCalledTimes(1);
  expect(withUser.spies.identify).toHaveBeenCalledWith("user-77");
  expect(withUser.spies.track).toHaveBeenCalledWith("tool_clicked", { name: "spray", legal: true });

  const anon = load("tok-123");
  anon.analytics.track("products_opened", { visitor_id: "v1" }, null);
  expect(anon.spies.identify).not.toHaveBeenCalled();
  expect(anon.spies.track).toHaveBeenCalledWith("products_opened", { visitor_id: "v1" });
});

test("non-object payloads are coerced to {} so track never throws", () => {
  const { analytics, spies } = load("tok-123");
  analytics.track("golive_started", undefined, "user-1");
  analytics.track("classes_opened", "not-an-object", "user-1");
  expect(spies.track).toHaveBeenNthCalledWith(1, "golive_started", {});
  expect(spies.track).toHaveBeenNthCalledWith(2, "classes_opened", {});
});
