// ADR-043 item 1 — ExpiryNotice "Not safe? SOS" routes through the injected onSos
// (which opens the mode sheet in _layout), falling back to a siren SOS when none.
import { cleanup, fireEvent, render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

const mockSend = jest.fn();
jest.mock("../services/protocolRunner", () => ({ runner: { send: (...a: unknown[]) => mockSend(...a), openExpiryChallenge: jest.fn() } }));

import { ExpiryNotice } from "../components/ExpiryNotice";
import { useJourney } from "../store/journey";

afterEach(() => cleanup());
beforeEach(() => {
  jest.clearAllMocks();
  useJourney.getState().set({ expiry: { at: Date.now(), variant: "expired" }, challenge: null });
});

const wrap = (el: React.ReactElement) => render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);

it("SOS button calls the injected onSos (opens the mode sheet), not a bare send", async () => {
  const onSos = jest.fn();
  const { getByTestId } = await wrap(<ExpiryNotice onSos={onSos} />);
  fireEvent.press(getByTestId("expiry-notice-sos"));
  expect(onSos).toHaveBeenCalledTimes(1);
  expect(mockSend).not.toHaveBeenCalled();
});

it("falls back to a siren-mode SOS when no onSos is injected", async () => {
  const { getByTestId } = await wrap(<ExpiryNotice />);
  fireEvent.press(getByTestId("expiry-notice-sos"));
  expect(mockSend).toHaveBeenCalledWith({ type: "SOS", mode: "siren" });
});
