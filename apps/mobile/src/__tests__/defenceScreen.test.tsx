import { render, act, fireEvent } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import type { Choice } from "../theme/ThemeProvider";

jest.mock("expo-location", () => ({ getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 28.6139, longitude: 77.209 } }) }));

const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a), flush: jest.fn() } }));

const mockOpenURL = jest.fn().mockResolvedValue(undefined);
jest.spyOn(require("react-native").Linking, "openURL").mockImplementation((...a: unknown[]) => mockOpenURL(...a));

import Defence from "../../app/(user)/defence";

const renderDefence = (pal: Choice = "midnight") => render(<ThemeProvider initial={pal}>{<Defence />}</ThemeProvider>);

beforeEach(() => jest.clearAllMocks());

describe("self-defence page", () => {
  it("renders the classes list (6 rows) with call + directions actions", async () => {
    const { getByTestId } = await renderDefence();
    await act(async () => {});
    getByTestId("defence-tab-classes");
    getByTestId("defence-tab-tools");
    getByTestId("class-row-0");
    getByTestId("class-row-5");
    getByTestId("class-call-0");
    getByTestId("class-directions-0");
    getByTestId("defence-disclaimer");
  });

  it("F1: shows the classes list on first open before location resolves", async () => {
    // Location hangs forever; the list must still render from the seeded origin.
    require("expo-location").getCurrentPositionAsync.mockReturnValueOnce(new Promise(() => {}));
    const { getByTestId } = await renderDefence();
    getByTestId("class-row-0");
    getByTestId("class-row-5");
  });

  it("class Call opens a tel: link", async () => {
    const { getByTestId } = await renderDefence();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("class-call-0")); });
    expect(mockOpenURL.mock.calls[0][0]).toMatch(/^tel:\+91\d+$/);
  });

  it("switching to Tools shows 5 tool rows and a Buy link", async () => {
    const { getByTestId, queryByTestId } = await renderDefence();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("defence-tab-tools")); });
    getByTestId("tool-row-0");
    getByTestId("tool-row-4");
    expect(queryByTestId("class-row-0")).toBeNull();
    await act(async () => { fireEvent.press(getByTestId("tool-buy-4")); });
    expect(mockOpenURL).toHaveBeenCalledWith("https://www.amazon.in/s?k=stun+gun");
  });

  it("emits classes_opened on mount, tools_opened on switch, tool_clicked on Buy", async () => {
    const { getByTestId } = await renderDefence();
    await act(async () => {});
    expect(mockLog.mock.calls[0][0]).toBe("classes_opened"); // default tab
    await act(async () => { fireEvent.press(getByTestId("defence-tab-tools")); });
    expect(mockLog.mock.calls.some((c) => c[0] === "tools_opened")).toBe(true);
    await act(async () => { fireEvent.press(getByTestId("tool-buy-0")); });
    const tc = mockLog.mock.calls.find((c) => c[0] === "tool_clicked");
    expect(tc).toBeTruthy();
    expect(tc![1]).toHaveProperty("name");
  });

  it("class Call emits class_card_selected + class_call_clicked; Directions emits class_map_clicked", async () => {
    const { getByTestId } = await renderDefence();
    await act(async () => {});
    await act(async () => { fireEvent.press(getByTestId("class-call-0")); });
    expect(mockLog.mock.calls.some((c) => c[0] === "class_card_selected")).toBe(true);
    expect(mockLog.mock.calls.some((c) => c[0] === "class_call_clicked")).toBe(true);
    await act(async () => { fireEvent.press(getByTestId("class-directions-0")); });
    expect(mockLog.mock.calls.some((c) => c[0] === "class_map_clicked")).toBe(true);
  });
});
