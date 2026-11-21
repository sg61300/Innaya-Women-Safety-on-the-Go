import { render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { TourOverlay } from "../components/tour/TourOverlay";
import { TOUR_STEPS } from "../components/tour/steps";

// Overlay reads safe-area insets; stub them (no SafeAreaProvider in the test).
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// B1: return a sentinel per tour.ui key so the assertions prove the button
// labels are read from i18n, not hard-coded in the overlay.
jest.mock("../i18n", () => ({
  __esModule: true,
  default: {
    on: jest.fn(),
    off: jest.fn(),
    t: (k: string) =>
      (({ "tour.ui.next": "NEXT_I18N", "tour.ui.done": "DONE_I18N", "tour.ui.back": "BACK_I18N", "tour.ui.close": "CLOSE_I18N", "tour.ui.hint": "HINT_I18N" }) as Record<string, string>)[k] ?? k,
  },
}));

// Drive the overlay directly with a fixed tour state — avoids the router/measure
// machinery so the test stays a pure copy assertion.
const mockTour = { active: true, index: 0, rect: null as unknown, next: jest.fn(), prev: jest.fn(), close: jest.fn() };
jest.mock("../components/tour/TourProvider", () => ({ useTour: () => mockTour }));

test("Next label comes from i18n (B1)", async () => {
  mockTour.index = 0;
  const { getByText } = await render(<ThemeProvider initial="midnight"><TourOverlay /></ThemeProvider>);
  getByText("NEXT_I18N");
});

test("Done label comes from i18n on the last step (B1)", async () => {
  mockTour.index = TOUR_STEPS.length - 1; // last step, whatever the step count
  const { getByText } = await render(<ThemeProvider initial="midnight"><TourOverlay /></ThemeProvider>);
  getByText("DONE_I18N");
});
