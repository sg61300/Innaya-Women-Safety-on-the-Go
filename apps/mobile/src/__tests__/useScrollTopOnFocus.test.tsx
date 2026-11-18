import React, { useRef } from "react";
import type { ScrollView } from "react-native";
import { render, act } from "@testing-library/react-native";

// F17: on focus the hook scrolls its ScrollView ref to the top. expo-router's
// useFocusEffect is mocked to fire the effect on mount (a focus).
// F17b: the hook also registers a `tabPress` listener; capture it so the test can
// fire a re-tap. getParent() returns undefined (single navigator level here).
// jest hoists jest.mock above imports, so the factory may only close over
// `mock`-prefixed module-scope vars — hence mockAddListener / mockTabPressCb.
let mockTabPressCb: (() => void) | null = null;
const mockAddListener = jest.fn((type: string, cb: () => void) => {
  if (type === "tabPress") mockTabPressCb = cb;
  return jest.fn();
});
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => void) => require("react").useEffect(() => cb(), []),
  useNavigation: () => ({ addListener: mockAddListener, getParent: () => undefined }),
}));
import { useScrollTopOnFocus } from "../lib/useScrollTopOnFocus";

const mockScrollTo = jest.fn();
function Harness() {
  const ref = useRef({ scrollTo: mockScrollTo } as unknown as ScrollView);
  useScrollTopOnFocus(ref);
  return null;
}

beforeEach(() => { mockScrollTo.mockClear(); mockAddListener.mockClear(); mockTabPressCb = null; });

test("scrolls to y:0 on focus", async () => {
  await act(async () => { render(<Harness />); });
  expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
});

// F17b: re-tapping the active tab emits `tabPress`; the hook's listener scrolls
// the list to the top. RED if the tabPress listener is removed.
test("scrolls to top on tabPress (re-tap of the active tab)", async () => {
  await act(async () => { render(<Harness />); });
  mockScrollTo.mockClear();
  expect(typeof mockTabPressCb).toBe("function");
  await act(async () => { mockTabPressCb!(); });
  expect(mockScrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
});

test("does not throw when the ref is not yet attached", async () => {
  function Empty() {
    const ref = useRef<ScrollView>(null);
    useScrollTopOnFocus(ref);
    return null;
  }
  await act(async () => { render(<Empty />); }); // no throw = pass
});
