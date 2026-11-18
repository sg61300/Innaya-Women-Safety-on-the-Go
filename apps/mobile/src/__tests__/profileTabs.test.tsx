import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { TourProvider } from "../components/tour/TourProvider";

// profile-cards (founder 2026-09-07): Profile is now a vertical list of cards
// (index) that PUSH to thin child routes, each wrapping an already-tested
// component — not an inline horizontal tab bar. So this suite proves (1) the
// card list navigates to the right child route, and (2) each child screen still
// renders its component and its behaviour (Vitals source radio, History 👎).

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
  useLocalSearchParams: () => ({}),
  router: { push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() },
}));

const mockFeedback = jest.fn().mockResolvedValue(undefined);
jest.mock("../services/history", () => ({
  falseAlarmRate: jest.fn(),
  history: {
    journeys: jest.fn().mockResolvedValue([
      { id: "j1", from_label: "Home", to_label: "Work", start_at: new Date(0).toISOString(), status: "resolved" },
    ]),
    alerts: jest.fn().mockResolvedValue([
      { id: 7, ts: new Date(0).toISOString(), type: "state_change", danger_score: 2, user_feedback: null },
    ]),
    feedback: (...a: unknown[]) => mockFeedback(...a),
    timeline: jest.fn(),
  },
}));

const mockSelect = jest.fn().mockResolvedValue(undefined);
jest.mock("../services/vitals", () => ({ vitals: { select: (...a: unknown[]) => mockSelect(...a) } }));

// Chainable supabase stub: builder methods return the chain; the chain is a
// thenable resolving to the configured list; .single() resolves a single row.
jest.mock("../lib/supabase", () => {
  const contacts = [{ id: "c1", name: "Amma Devi", phone: "9876500000", tier: "primary", linked_user_id: "u2" }];
  const chain: any = {};
  for (const m of ["select", "eq", "order", "update"]) chain[m] = () => chain;
  chain.single = () => Promise.resolve({ data: { emergency_password_hash: null }, error: null });
  chain.then = (res: any) => Promise.resolve({ data: contacts, error: null }).then(res);
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      from: () => chain,
    },
  };
});

import ProfileIndex from "../../app/(user)/profile/index";
import GuardiansScreen from "../../app/(user)/profile/guardians";
import VitalsScreen from "../../app/(user)/profile/vitals";
import HistoryScreen from "../../app/(user)/profile/history";

// This machine transforms the full RN + screen module graph on the first test of
// the suite; 30 s is not enough for that cold start under maxWorkers=2.
jest.setTimeout(120_000);

const wrap = (node: React.ReactElement) =>
  render(<ThemeProvider initial="midnight"><TourProvider>{node}</TourProvider></ThemeProvider>);

const tap = (get: (id: string) => unknown, id: string) =>
  act(async () => { fireEvent.press(get(id) as never); });

beforeEach(() => jest.clearAllMocks());

test("the card list pushes to the Guardians child route", async () => {
  const { getByTestId } = await wrap(<ProfileIndex />);
  await act(async () => {});
  await tap(getByTestId, "profile-card-guardians");
  expect(mockPush).toHaveBeenCalledWith("/(user)/profile/guardians");
});

test("the Safety words card pushes to the safety-words edit screen", async () => {
  const { getByTestId } = await wrap(<ProfileIndex />);
  await act(async () => {});
  await tap(getByTestId, "profile-card-safety-words");
  expect(mockPush).toHaveBeenCalledWith("/(setup)/safety-words?reason=edit");
});

test("Guardians child lists the owner's contacts with a tier chip", async () => {
  const { getByTestId, findByTestId } = await wrap(<GuardiansScreen />);
  await findByTestId("guardians-tab");
  getByTestId("guardian-row-c1");
  getByTestId("guardian-dot-c1");
});

test("Vitals child renders and keeps unavailable BLE source disabled", async () => {
  const { getByTestId } = await wrap(<VitalsScreen />);
  await act(async () => {});
  getByTestId("vitals-tab");
  await tap(getByTestId, "vitals-source-ble");
  expect(getByTestId("vitals-source-ble").props.accessibilityState.disabled).toBe(true);
  expect(mockSelect).not.toHaveBeenCalled();
});

test("Vitals pendant source is disabled (coming)", async () => {
  const { getByTestId } = await wrap(<VitalsScreen />);
  await act(async () => {});
  expect(getByTestId("vitals-source-pendant").props.accessibilityState.disabled).toBe(true);
});

test("History child expands a journey and 👎 writes false_alarm feedback", async () => {
  const { getByTestId, findByTestId } = await wrap(<HistoryScreen />);
  await findByTestId("history-tab");
  await tap(getByTestId, "history-journey-j1");
  await findByTestId("history-false-7");
  await tap(getByTestId, "history-false-7");
  expect(mockFeedback).toHaveBeenCalledWith(7, "false_alarm");
});
