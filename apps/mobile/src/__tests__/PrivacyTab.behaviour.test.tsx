import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { PrivacyTab } from "../components/PrivacyTab";

// Configurable per-test doubles for the two awaits inside toggleTraining and the
// load effect. `mockSingle` resolves the saved value; `mockEqResult` is what the
// DB update's .eq() resolves to; `mockLog` is events.log.
let mockSingle: () => Promise<{ data: unknown }>;
let mockEqResult: () => Promise<{ error: unknown }>;
let mockLog: (...a: unknown[]) => Promise<void>;
let mockUpdateArgs: unknown[];
let mockEqArgs: unknown[];

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => mockSingle() }) }),
      update: (v: unknown) => { mockUpdateArgs.push(v); return { eq: (_col: unknown, id: unknown) => { mockEqArgs.push(id); return mockEqResult(); } }; },
    }),
  },
}));
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

beforeEach(() => {
  mockSingle = async () => ({ data: { consent_c7_training: false } });
  mockEqResult = async () => ({ error: null });
  mockLog = jest.fn(async () => {});
  mockUpdateArgs = [];
  mockEqArgs = [];
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const sw = (r: Awaited<ReturnType<typeof render>>) => r.getByTestId("privacy-training-switch");

// F1: DB write succeeds, only the event log throws -> UI must KEEP the new value.
test("keeps the toggled value when only the consent log fails", async () => {
  mockEqResult = async () => ({ error: null });
  mockLog = async () => { throw new Error("log boom"); };
  const r = await render(<ThemeProvider initial="violetBloom"><PrivacyTab userId="u1" /></ThemeProvider>);
  await act(async () => {});
  await act(async () => { fireEvent(sw(r), "valueChange", true); });
  expect(sw(r).props.value).toBe(true);
  expect(console.warn).toHaveBeenCalledWith("[privacy] consent_c7 log failed", "log boom");
});

// F1: DB write fails -> UI must REVERT.
test("reverts the toggle when the DB write fails", async () => {
  mockEqResult = async () => ({ error: { message: "db boom" } });
  const r = await render(<ThemeProvider initial="violetBloom"><PrivacyTab userId="u1" /></ThemeProvider>);
  await act(async () => {});
  await act(async () => { fireEvent(sw(r), "valueChange", true); });
  expect(sw(r).props.value).toBe(false);
});

// F4: loads the saved ON value; toggling OFF writes the row and logs consent_c7.
test("saved ON, toggling OFF writes the row and logs consent_c7", async () => {
  mockSingle = async () => ({ data: { consent_c7_training: true } });
  const r = await render(<ThemeProvider initial="violetBloom"><PrivacyTab userId="u9" /></ThemeProvider>);
  await act(async () => {});
  expect(sw(r).props.value).toBe(true);
  await act(async () => { fireEvent(sw(r), "valueChange", false); });
  expect(sw(r).props.value).toBe(false);
  expect(mockUpdateArgs[0]).toMatchObject({ consent_c7_training: false });
  expect((mockUpdateArgs[0] as { consent_c7_answered_at?: string }).consent_c7_answered_at).toEqual(expect.any(String));
  expect(mockEqArgs[0]).toBe("u9");
  expect(mockLog).toHaveBeenCalledWith("consent_c7", expect.objectContaining({ on: false }));
});

// F2: the user toggles before the initial load resolves -> the late load with
// the old saved value must NOT overwrite the user's choice.
test("a slow initial load does not overwrite a toggle made while it is in flight", async () => {
  let resolveLoad!: (v: { data: unknown }) => void;
  mockSingle = () => new Promise((res) => { resolveLoad = res; });
  const r = await render(<ThemeProvider initial="violetBloom"><PrivacyTab userId="u1" /></ThemeProvider>);
  // User flips ON before the (saved: OFF) load returns.
  await act(async () => { fireEvent(sw(r), "valueChange", true); });
  await act(async () => { resolveLoad({ data: { consent_c7_training: false } }); });
  expect(sw(r).props.value).toBe(true);
});
