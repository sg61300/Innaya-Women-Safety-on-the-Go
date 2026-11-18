import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));

const mockEq = jest.fn(() => Promise.resolve({ error: null }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ update: mockUpdate }));
// The factory runs while LanguageScreen is being required (hoisted above the
// const inits), so reference mockFrom lazily — reading it at call time, once
// the const is initialised, not at factory-eval time when it is still undefined.
jest.mock("../lib/supabase", () => ({
  supabase: { from: (...args: unknown[]) => (mockFrom as (...a: unknown[]) => unknown)(...args) },
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import LanguageScreen from "../../app/(setup)/language";
import { useSession } from "../store/session";

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.clear();
  useSession.setState({ userId: null, profile: null });
});

test("signed-out: picking a language stores it and re-runs the root route decision", async () => {
  const { getByTestId } = await render(<ThemeProvider><LanguageScreen /></ThemeProvider>);
  await fireEvent.press(getByTestId("lang-hi"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(await AsyncStorage.getItem("vaira.language")).toBe("hi");
  expect(mockBack).not.toHaveBeenCalled();
});

test("signed-in: picking a language updates the profile and re-runs the root route decision", async () => {
  useSession.setState({ userId: "user-1" });
  const { getByTestId } = await render(<ThemeProvider><LanguageScreen /></ThemeProvider>);
  await fireEvent.press(getByTestId("lang-hi"));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  expect(mockFrom).toHaveBeenCalledWith("profiles");
  expect(mockUpdate).toHaveBeenCalledWith({ language: "hi" });
  expect(mockEq).toHaveBeenCalledWith("id", "user-1");
  expect(await AsyncStorage.getItem("vaira.language")).toBe("hi");
  expect(mockBack).not.toHaveBeenCalled();
});
