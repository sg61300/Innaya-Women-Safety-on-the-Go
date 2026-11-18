import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { CityPicker } from "../components/CityPicker";

const mockGetPos = jest.fn();
const mockReqPerm = jest.fn();
jest.mock("expo-location", () => ({
  getCurrentPositionAsync: (...a: any[]) => mockGetPos(...a),
  requestForegroundPermissionsAsync: (...a: any[]) => mockReqPerm(...a),
}));
const mockRpc = jest.fn().mockResolvedValue({ data: [], error: null });
jest.mock("../lib/supabase", () => ({ supabase: { rpc: (...a: any[]) => mockRpc(...a) } }));

const w = (el: React.ReactElement) =>
  render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);

beforeEach(() => {
  mockGetPos.mockReset();
  mockReqPerm.mockReset().mockResolvedValue({ status: "granted" });
  mockRpc.mockReset().mockResolvedValue({ data: [], error: null });
});

test("crosshair: idle shows no message, opens the sheet, selects a city", async () => {
  const onChange = jest.fn();
  const s = await w(<CityPicker value="other" onChange={onChange} />);
  expect(s.queryByTestId("citypicker-message")).toBeNull(); // idle
  fireEvent.press(s.getByTestId("citypicker-select"));
  fireEvent.press(await s.findByTestId("citypicker-option-delhi"));
  expect(onChange).toHaveBeenCalledWith("delhi");
});

test("sheet intercepts presses so a body tap cannot reach the backdrop; backdrop is a button", async () => {
  const s = await w(<CityPicker value="delhi" onChange={jest.fn()} />);
  fireEvent.press(s.getByTestId("citypicker-select"));
  const sheet = await s.findByTestId("citypicker-sheet");
  // The sheet stops touch propagation to the backdrop Pressable behind it.
  expect(sheet.props.onPress || sheet.props.onStartShouldSetResponder).toBeDefined();
  expect(s.getByTestId("citypicker-backdrop").props.accessibilityRole).toBe("button");
});

test("crosshair: loading state message while the GPS fix is pending", async () => {
  mockGetPos.mockReturnValue(new Promise(() => {})); // never resolves
  const s = await w(<CityPicker value="other" onChange={jest.fn()} />);
  await act(async () => { fireEvent.press(s.getByTestId("citypicker-detect")); });
  s.getByText("Locating you…");
});

test("crosshair: done maps the fix into a city and reports it", async () => {
  mockGetPos.mockResolvedValue({ coords: { latitude: 12.9716, longitude: 77.5946 } });
  const onChange = jest.fn();
  const onDetected = jest.fn();
  const s = await w(<CityPicker value="other" onChange={onChange} onDetected={onDetected} />);
  await act(async () => { fireEvent.press(s.getByTestId("citypicker-detect")); });
  await waitFor(() => s.getByText("✓ Location detected — Bengaluru, Karnataka"));
  expect(onChange).toHaveBeenCalledWith("bengaluru");
  expect(onDetected).toHaveBeenCalledWith("bengaluru", "Bengaluru, Karnataka");
});

test("crosshair: error message when the GPS fix rejects", async () => {
  mockGetPos.mockRejectedValue(new Error("denied"));
  const s = await w(<CityPicker value="other" onChange={jest.fn()} />);
  await act(async () => { fireEvent.press(s.getByTestId("citypicker-detect")); });
  await waitFor(() => s.getByText("Could not detect location. Please select manually."));
});

test("crosshair: permission denied shows the denied message and never reads GPS", async () => {
  mockReqPerm.mockResolvedValue({ status: "denied" });
  const s = await w(<CityPicker value="other" onChange={jest.fn()} />);
  await act(async () => { fireEvent.press(s.getByTestId("citypicker-detect")); });
  await waitFor(() => s.getByText("Location permission is off. Enable it in Settings or select your city manually."));
  expect(mockGetPos).not.toHaveBeenCalled();
});

test("regions chip summarises unsafe zones and red alerts for the chosen city", async () => {
  mockRpc.mockResolvedValue({ data: [{ status: "amber" }, { status: "red" }, { status: "red" }], error: null });
  const s = await w(<CityPicker value="bengaluru" onChange={jest.fn()} />);
  await act(async () => {}); // flush the mount-effect regions rpc + setZones inside act
  await waitFor(() => s.getByText("3 unsafe zones, 2 red alerts — shown on your map"));
  expect(mockRpc).toHaveBeenCalledWith("regions_near", { lat: 12.9716, lng: 77.5946, radius_m: 15000 });
});

test("regions chip excludes safe_by_police rows from the unsafe count", async () => {
  mockRpc.mockResolvedValue({ data: [{ status: "safe_by_police" }, { status: "amber" }, { status: "red" }], error: null });
  const s = await w(<CityPicker value="bengaluru" onChange={jest.fn()} />);
  await act(async () => {});
  await waitFor(() => s.getByText("2 unsafe zones, 1 red alerts — shown on your map"));
});

test("regions chip is hidden when there are no unsafe zones", async () => {
  mockRpc.mockResolvedValue({ data: [], error: null });
  const s = await w(<CityPicker value="bengaluru" onChange={jest.fn()} />);
  await act(async () => {});
  expect(s.queryByTestId("citypicker-zones")).toBeNull();
});
