// ADR-043 item 7: the public API fallback host must be the public host (the delta host
// is an auto alias of the same Vercel project; APP_BASE_URL + Home link already
// use the public host). CI still overrides via EXPO_PUBLIC_API_URL.
jest.mock("../lib/supabase", () => ({ supabase: { auth: {} } }));

describe("api fallback host (ADR-043 item 7)", () => {
  const prev = process.env.EXPO_PUBLIC_API_URL;
  afterEach(() => {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = prev;
    jest.resetModules();
  });

  it("falls back to innaya-api.example.com when nothing is configured", () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const { apiUrl } = require("../lib/api");
    expect(apiUrl("/api/journey-state")).toBe("https://innaya-api.example.com/api/journey-state");
  });

  it("does not fall back to the old delta host", () => {
    delete process.env.EXPO_PUBLIC_API_URL;
    const { apiUrl } = require("../lib/api");
    expect(apiUrl("x")).not.toContain("old-host");
  });

  it("still honours a configured EXPO_PUBLIC_API_URL", () => {
    process.env.EXPO_PUBLIC_API_URL = "https://custom.example.com/";
    const { apiUrl } = require("../lib/api");
    expect(apiUrl("/api/x")).toBe("https://custom.example.com/api/x");
  });
});
