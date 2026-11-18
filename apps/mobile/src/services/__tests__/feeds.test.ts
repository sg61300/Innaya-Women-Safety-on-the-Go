// Stress test for the runtime wiring: attach binds to the journey, onFix is gated
// on the monitoring states + no journey, MONITOR_CAP fires once at the cap window,
// and detach stops the feeds and unsubscribes the tier-2 callback.
jest.mock("../protocolRunner", () => ({ runner: { send: jest.fn(), onChallengeResolved: jest.fn(() => jest.fn()) } }));
jest.mock("../../lib/api", () => ({ fetchRoute: jest.fn(async () => ({ polyline: [], durationSec: 1, durationInTrafficSec: 1, distanceM: 1 })) }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Medium: "m" } }));
// F4: feeds now logs a route_error event via lib/events (supabase-backed) — mock it.
jest.mock("../../lib/events", () => ({ events: { log: jest.fn(async () => {}) } }));

import { feeds } from "../feeds";
import { useJourney } from "../../store/journey";
import { initialContext } from "@vaira/core";
import { runner } from "../protocolRunner";
import { fetchRoute } from "../../lib/api";

const send = runner.send as jest.Mock;
const onResolved = runner.onChallengeResolved as jest.Mock;
const fetchRouteMock = fetchRoute as jest.Mock;

const baseCtx = { ...initialContext(), state: "SAFE" as const };
const fix = (at: number) => ({ lat: 28.65, lng: 77.25, accuracyM: 12, speedMps: 0, at });
const journeyRow = { id: "j1", from_lat: 28.6, from_lng: 77.2, to_lat: 28.7, to_lng: 77.3, start_at: new Date(0).toISOString(), eta_seconds: 600 };

beforeEach(() => {
  send.mockClear();
  fetchRouteMock.mockClear();
  onResolved.mockClear();
  onResolved.mockReturnValue(jest.fn());
  useJourney.setState({ journey: null, ctx: initialContext(), challenge: null });
});

test("no journey → attach is a no-op and onFix does nothing", async () => {
  feeds.attach();
  await feeds.onFix(fix(0));
  expect(send).not.toHaveBeenCalled();
});

test("onFix is gated on the monitoring states", async () => {
  useJourney.setState({ journey: journeyRow, ctx: { ...baseCtx, state: "IDLE" } });
  feeds.attach();
  await feeds.onFix(fix(0));
  expect(fetchRouteMock).not.toHaveBeenCalled(); // route feed never ran → no proxy call
  feeds.detach();
});

test("MONITOR_CAP fires once past the cap window then never again", async () => {
  useJourney.setState({ journey: journeyRow, ctx: baseCtx }); // capFor(600) = 3*600*1000 + 30min ≈ 3.6M ms
  feeds.attach();
  await feeds.onFix(fix(4_000_000)); // past cap
  await feeds.onFix(fix(5_000_000));
  const caps = send.mock.calls.filter((c) => c[0]?.type === "MONITOR_CAP");
  expect(caps).toHaveLength(1);
  feeds.detach();
});

test("detach unsubscribes and stops onFix side effects", async () => {
  const unsub = jest.fn();
  onResolved.mockReturnValueOnce(unsub);
  useJourney.setState({ journey: journeyRow, ctx: baseCtx });
  feeds.attach();
  feeds.detach();
  expect(unsub).toHaveBeenCalledTimes(1);
  send.mockClear();
  await feeds.onFix(fix(9_000_000));
  expect(send).not.toHaveBeenCalled();
});
