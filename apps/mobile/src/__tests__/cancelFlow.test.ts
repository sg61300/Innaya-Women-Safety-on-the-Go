// ADR-043 — the trimmed cancelFlow module: ONLY the EMERGENCY "I'm safe now"
// guardian-confirm realtime path survives (the ADR-014 CRITICAL cancel machinery
// is retired; the guardian-approved cancel now runs through cancelFlowDeps.ts).

const mockSend = jest.fn();
jest.mock("../services/protocolRunner", () => ({ runner: { send: (...a: unknown[]) => mockSend(...a) } }));

let mockChannelHandlers: Record<string, (p: unknown) => void>;
const mockSubscribe = jest.fn();
const mockRemoveChannel = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: {
    channel: () => {
      const ch: any = {
        on: (_e: string, cfg: any, h: (p: unknown) => void) => {
          mockChannelHandlers[cfg.event] = h;
          return ch;
        },
        subscribe: (...a: unknown[]) => mockSubscribe(...a),
      };
      return ch;
    },
    removeChannel: (...a: unknown[]) => mockRemoveChannel(...a),
  },
}));

import { cancelFlow } from "../services/cancelFlow";
import { useJourney } from "../store/journey";

const base = { ending: false, heightened: false, cameraPaused: false, challenge: null, alarmMode: "siren" as const } as const;

beforeEach(() => {
  useJourney.getState().reset();
  cancelFlow.dispose();
  jest.clearAllMocks();
  mockChannelHandlers = {};
});

test("EMERGENCY confirm: safe → guardian-confirmed CHALLENGE_PASSED; wrong → SOS; failed → CALL_FAILED", () => {
  useJourney.getState().set({ ctx: { ...base, state: "EMERGENCY" } });
  cancelFlow.onResult("safe", "r1");
  expect(mockSend).toHaveBeenLastCalledWith({ type: "CHALLENGE_PASSED", guardianConfirmed: true });
  cancelFlow.onResult("wrong", "r2");
  expect(mockSend).toHaveBeenLastCalledWith({ type: "SOS" });
  cancelFlow.onResult("failed", "r3");
  expect(mockSend).toHaveBeenLastCalledWith({ type: "CALL_FAILED" });
});

test("onResult in a non-EMERGENCY state records only (no local event)", () => {
  for (const state of ["SAFE", "CRITICAL", "CANCEL_HOLD"] as const) {
    mockSend.mockClear();
    useJourney.getState().set({ ctx: { ...base, state } });
    cancelFlow.onResult("safe", `row-${state}`);
    expect(mockSend).not.toHaveBeenCalled();
  }
});

test("a row id already handled is ignored (idempotent realtime)", () => {
  useJourney.getState().set({ ctx: { ...base, state: "EMERGENCY" } });
  cancelFlow.onResult("safe", "dup");
  const n = mockSend.mock.calls.length;
  cancelFlow.onResult("wrong", "dup");
  expect(mockSend.mock.calls.length).toBe(n);
});

test("subscribe wires realtime UPDATE/INSERT rows into onResult", () => {
  useJourney.getState().set({ journey: { id: "j1" }, ctx: { ...base, state: "EMERGENCY" } });
  cancelFlow.ensureSubscribed("j1");
  expect(mockSubscribe).toHaveBeenCalled();
  mockChannelHandlers.UPDATE?.({ new: { id: "row1", result: "safe" } });
  expect(mockSend).toHaveBeenLastCalledWith({ type: "CHALLENGE_PASSED", guardianConfirmed: true });
});

test("dispose removes the channel and clears handled ids", () => {
  useJourney.getState().set({ journey: { id: "j1" }, ctx: { ...base, state: "EMERGENCY" } });
  cancelFlow.ensureSubscribed("j1");
  cancelFlow.dispose();
  expect(mockRemoveChannel).toHaveBeenCalled();
});
