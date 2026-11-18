// ADR-043 item 1 — SOS mode sheet (Siren / Silent, auto-siren at 10 s).
import { act, cleanup, fireEvent, render } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { SosModeSheet } from "../components/SosModeSheet";

// Unmount each render so ThemeProvider's async AsyncStorage read cannot resolve a
// setState into the next test's act() scope (the "overlapping act" blank-render
// trap the jest.setup comment describes).
afterEach(() => cleanup());

const wrap = (el: React.ReactElement) => render(<ThemeProvider initial="violetBloom">{el}</ThemeProvider>);

describe("SosModeSheet (item 1)", () => {
  it("tapping Siren chooses siren", async () => {
    const onChoose = jest.fn();
    const { getByTestId } = await wrap(<SosModeSheet visible onChoose={onChoose} />);
    fireEvent.press(getByTestId("sos-mode-siren"));
    expect(onChoose).toHaveBeenCalledWith("siren");
  });

  it("tapping Silent chooses silent", async () => {
    const onChoose = jest.fn();
    const { getByTestId } = await wrap(<SosModeSheet visible onChoose={onChoose} />);
    fireEvent.press(getByTestId("sos-mode-silent"));
    expect(onChoose).toHaveBeenCalledWith("silent");
  });

  it("auto-selects Siren once after 10 s with no choice", async () => {
    jest.useFakeTimers();
    try {
      const onChoose = jest.fn();
      await wrap(<SosModeSheet visible onChoose={onChoose} />);
      expect(onChoose).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(10_000); });
      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenCalledWith("siren");
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });

  it("a choice within the window cancels the auto-siren (no double fire)", async () => {
    jest.useFakeTimers();
    try {
      const onChoose = jest.fn();
      const { getByTestId } = await wrap(<SosModeSheet visible onChoose={onChoose} />);
      fireEvent.press(getByTestId("sos-mode-silent"));
      await act(async () => { jest.advanceTimersByTime(10_000); });
      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenCalledWith("silent");
    } finally {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    }
  });

  it("renders nothing when not visible", async () => {
    const onChoose = jest.fn();
    const { queryByTestId } = await wrap(<SosModeSheet visible={false} onChoose={onChoose} />);
    expect(queryByTestId("sos-mode-sheet")).toBeNull();
  });
});
