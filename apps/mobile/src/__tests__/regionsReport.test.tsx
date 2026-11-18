import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

const mockBack = jest.fn();
const mockNavigate = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn(), replace: jest.fn(), back: (...a: unknown[]) => mockBack(...a) }),
  useLocalSearchParams: () => ({ lat: "28.7", lng: "77.3", radius: "150" }),
}));

jest.mock("../lib/supabase", () => ({ supabase: { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) } } }));
import { supabase } from "../lib/supabase";

const mockReport = jest.fn().mockResolvedValue("r9");
jest.mock("../services/regions", () => ({
  ...jest.requireActual("../services/regions"),
  regions: { near: jest.fn(), report: (...a: unknown[]) => mockReport(...a), detail: jest.fn() },
}));

import AddReport from "../../app/(user)/regions/report";

const wrap = () => render(<ThemeProvider initial="midnight"><AddReport /></ThemeProvider>);
const press = (get: (id: string) => unknown, id: string) => act(async () => { fireEvent.press(get(id) as never); });

beforeEach(() => { jest.clearAllMocks(); jest.useFakeTimers(); });
afterEach(() => jest.useRealTimers());

test("a reason is required, then report() is called with the passed coords and back() runs", async () => {
  const { getByTestId } = await wrap();
  await act(async () => {});
  // submit disabled without a reason: report() never fires
  await press(getByTestId, "report-submit");
  expect(mockReport).not.toHaveBeenCalled();
  await press(getByTestId, "report-reason-harassment");
  await press(getByTestId, "report-time-night");
  await press(getByTestId, "report-submit");
  expect(mockReport).toHaveBeenCalledWith(
    expect.objectContaining({ reason: "harassment", timeOfDay: "night", lat: 28.7, lng: 77.3, radiusM: 150 }),
    "u1"
  );
  getByTestId("report-success");
  await act(async () => { jest.advanceTimersByTime(900); });
  // F4: on success we return to the Regions list with the reported area flagged.
  expect(mockNavigate).toHaveBeenCalledWith(
    expect.objectContaining({ pathname: "/(user)/regions", params: expect.objectContaining({ highlight: "r9" }) })
  );
});

test("no signed-in user shows an error and never calls report()", async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({ data: { user: null } });
  const { getByTestId } = await wrap();
  await act(async () => {});
  await press(getByTestId, "report-reason-stalking");
  await press(getByTestId, "report-submit");
  getByTestId("report-error");
  expect(mockReport).not.toHaveBeenCalled();
});
