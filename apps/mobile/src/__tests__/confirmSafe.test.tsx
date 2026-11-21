// Task 29b — guardian 360° confirm screen. Structural test (pure UI wiring, so
// enable/disable + button → service wiring rather than a RED-first assertion).
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

const mockBack = jest.fn();
let mockSearchParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: (...a: unknown[]) => mockBack(...a), push: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}));

const mockConfirmSafe = jest.fn().mockResolvedValue({});
const mockSomethingWrong = jest.fn().mockResolvedValue({});
const mockRaiseSos = jest.fn().mockResolvedValue({});
jest.mock("../services/guardian", () => ({
  guardian: {
    confirmSafe: (...a: unknown[]) => mockConfirmSafe(...a),
    somethingWrong: (...a: unknown[]) => mockSomethingWrong(...a),
    raiseSos: (...a: unknown[]) => mockRaiseSos(...a),
  },
}));

let mockChannelHandlers: Record<string, (m: any) => void | Promise<void>>;
const mockCreateSignedUrl = jest.fn().mockResolvedValue({ data: null });
jest.mock("../lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { profiles: { name: "Asha" } } }) }) }) }),
    channel: () => {
      const ch: any = {
        on: (_e: string, cfg: any, h: (m: any) => void) => {
          if (cfg?.table) mockChannelHandlers[cfg.table] = h;
          return ch;
        },
        subscribe: jest.fn(),
      };
      return ch;
    },
    removeChannel: jest.fn(),
    storage: { from: () => ({ createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a) }) },
  },
}));

const mockOpenBrowser = jest.fn().mockResolvedValue({ type: "opened" });
jest.mock("expo-web-browser", () => ({ openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...a) }));

import ConfirmSafe from "../../app/(guardian)/confirm-safe";

const mount = async (node: React.ReactElement) => {
  const utils = await render(<ThemeProvider>{node}</ThemeProvider>);
  await act(async () => {});
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { journeyId: "j1", name: "her" };
  mockChannelHandlers = {};
  mockCreateSignedUrl.mockResolvedValue({ data: null });
});

test("She's safe is disabled at mount and enabled after 15 s, then confirms", async () => {
  jest.useFakeTimers();
  try {
    const { getByTestId } = await mount(<ConfirmSafe />);
    expect(getByTestId("confirm-safe").props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    expect(getByTestId("confirm-safe").props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(getByTestId("confirm-safe"));
    });
    expect(mockConfirmSafe).toHaveBeenCalledWith("j1");
  } finally {
    jest.useRealTimers();
  }
});

test("Something's wrong is always enabled and routes to somethingWrong", async () => {
  const { getByTestId } = await mount(<ConfirmSafe />);
  expect(getByTestId("confirm-wrong").props.accessibilityState.disabled).toBe(false);
  await act(async () => {
    fireEvent.press(getByTestId("confirm-wrong"));
  });
  expect(mockSomethingWrong).toHaveBeenCalledWith("j1");
});

test("after She's safe, the cancelled banner and a persistent Raise alarm appear", async () => {
  jest.useFakeTimers();
  try {
    const { getByTestId, queryByTestId } = await mount(<ConfirmSafe />);
    expect(queryByTestId("confirm-banner")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    await act(async () => {
      fireEvent.press(getByTestId("confirm-safe"));
    });
    expect(getByTestId("confirm-banner")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId("confirm-raise"));
    });
    expect(mockRaiseSos).toHaveBeenCalledWith("j1");
  } finally {
    jest.useRealTimers();
  }
});

test("≥ 3 frames unlock She's safe before the 15 s timer", async () => {
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/f.jpg" } });
  const { getByTestId } = await mount(<ConfirmSafe />);
  expect(getByTestId("confirm-safe").props.accessibilityState.disabled).toBe(true);
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await mockChannelHandlers["events"]?.({ new: { type: "frame", payload: { path: `j1/f${i}.jpg` } } });
    });
  }
  expect(getByTestId("confirm-safe").props.accessibilityState.disabled).toBe(false);
});

// Phase 3b (founder 2-a): the in-screen "‹ Back" link was removed; the top-bar
// arrow is the only back control (its action was the same plain router.back()).
test("no in-screen back link; the top-bar arrow is the only back control", async () => {
  const { queryByTestId } = await mount(<ConfirmSafe />);
  expect(queryByTestId("confirm-back")).toBeNull();
});

// ADR-043 (s23 I7): a cancel_request push carries the guardian's per-guardian
// vote link; the screen forwards to the web vote page, with no in-app vote UI.
test("cancel_request context opens the vote link in the browser, shows no 360° UI", async () => {
  mockSearchParams = { journeyId: "j1", requestId: "r1", link: "https://api.example/g/TOKEN?cr=r1&vt=VT" };
  const { getByTestId, queryByTestId } = await mount(<ConfirmSafe />);
  expect(mockOpenBrowser).toHaveBeenCalledWith("https://api.example/g/TOKEN?cr=r1&vt=VT");
  expect(getByTestId("confirm-forward")).toBeTruthy();
  expect(queryByTestId("confirm-safe")).toBeNull(); // the in-app 360° vote button is gone
  await act(async () => {
    fireEvent.press(getByTestId("confirm-open-vote"));
  });
  expect(mockOpenBrowser).toHaveBeenCalledTimes(2);
});

test("a push with no link falls back to the 360° confirm screen, no browser opened", async () => {
  mockSearchParams = { journeyId: "j1", name: "her" };
  const { getByTestId, queryByTestId } = await mount(<ConfirmSafe />);
  expect(getByTestId("confirm-safe")).toBeTruthy(); // 360° UI present
  expect(queryByTestId("confirm-forward")).toBeNull();
  expect(mockOpenBrowser).not.toHaveBeenCalled();
});

test("a malformed vote link is not opened and falls back to the 360° screen", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  mockSearchParams = { journeyId: "j1", link: "javascript:alert(1)" };
  const { getByTestId, queryByTestId } = await mount(<ConfirmSafe />);
  expect(getByTestId("confirm-safe")).toBeTruthy();
  expect(queryByTestId("confirm-forward")).toBeNull();
  expect(mockOpenBrowser).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
