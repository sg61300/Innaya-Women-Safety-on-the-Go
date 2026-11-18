import { render } from "@testing-library/react-native";
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ palette: "sakuraDawn" }), useRouter: () => ({ replace: jest.fn() }) }));
// The kit now includes CityPicker, which imports the supabase client (constructed
// at module load) and expo-location. Stub both so the dev gallery renders offline.
jest.mock("../lib/supabase", () => ({ supabase: { rpc: jest.fn().mockResolvedValue({ data: [], error: null }) } }));
jest.mock("expo-location", () => ({ getCurrentPositionAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" } }));
import Gallery from "../../app/(user)/gallery";
import { ThemeProvider } from "../theme";
// render() is async in this project (React 19 / concurrent) — await it.
test("gallery renders every kit element and switches palette from the param", async () => {
  const { getByText, getAllByTestId } = await render(<ThemeProvider><Gallery /></ThemeProvider>);
  getByText("display"); getByText("numeral"); getByText("JOURNEY ACTIVE · SAFE");
  expect(getAllByTestId("guardian-ring")).toHaveLength(5);
  getByText("Palette: Sakura Dawn");
});
