import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

// Restyle test (Pre-35 item A). The choose() logic itself is covered
// RED→GREEN in language.test.tsx; this proves the merged-kit restyle:
// title, per-language English subname, three lang-* buttons, and that a
// press still drives setLanguage + router.replace("/").
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace, back: jest.fn() }) }));

const mockSetLanguage = jest.fn().mockResolvedValue(undefined);
jest.mock("../i18n", () => ({
  __esModule: true,
  default: { t: (k: string) => k, on: jest.fn(), off: jest.fn() },
  setLanguage: (...args: unknown[]) => (mockSetLanguage as (...a: unknown[]) => unknown)(...args),
  LANGS: [
    { code: "en", label: "English" },
    { code: "hi", label: "हिन्दी" },
    { code: "kn", label: "ಕನ್ನಡ" },
  ],
}));

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn() } }));

import LanguageScreen from "../../app/(setup)/language";
import { useSession } from "../store/session";

const wrap = () => render(<ThemeProvider><LanguageScreen /></ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ userId: null, profile: null });
});

test("renders the title and one button per language", async () => {
  const { getByTestId, getByText } = await wrap();
  getByText("language.title");
  getByTestId("lang-en");
  getByTestId("lang-hi");
  getByTestId("lang-kn");
});

test("shows the English name under each native label", async () => {
  const { getByText } = await wrap();
  getByText("language.englishName.en");
  getByText("language.englishName.hi");
  getByText("language.englishName.kn");
});

test("each button keeps its native accessibilityLabel", async () => {
  const { getByTestId } = await wrap();
  expect(getByTestId("lang-hi").props.accessibilityLabel).toBe("हिन्दी");
  expect(getByTestId("lang-hi").props.accessibilityRole).toBe("button");
});

test("pressing a language calls setLanguage and returns to root", async () => {
  const { getByTestId } = await wrap();
  await fireEvent.press(getByTestId("lang-hi"));
  await waitFor(() => expect(mockSetLanguage).toHaveBeenCalledWith("hi"));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
});
