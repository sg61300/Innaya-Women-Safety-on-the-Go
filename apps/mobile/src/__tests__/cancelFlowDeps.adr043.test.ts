// ADR-043 item 5 — the real CancelFlow dependency factory: 409 surfacing. The verdict
// watch moved to services/cancelWatch (Fix AD round 2; see cancelWaiting.g2g8.test).
jest.useFakeTimers();

const mockSend = jest.fn();
jest.mock("../services/protocolRunner", () => ({ runner: { send: (...a: unknown[]) => mockSend(...a), verifySafeWord: jest.fn() } }));
jest.mock("../services/gates", () => ({ gates: { verifyPassword: jest.fn() } }));
jest.mock("../services/appPassword", () => ({ resolveAccountEmail: jest.fn().mockResolvedValue("a@b.c") }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock("../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a), get: (...a: unknown[]) => mockGet(...a) }));

// A realtime channel that NEVER delivers an event (the drop we poll around).
const mockRemoveChannel = jest.fn();
jest.mock("../lib/supabase", () => {
  const ch: any = { on: () => ch, subscribe: () => ch };
  return { supabase: { channel: () => ch, removeChannel: (...a: unknown[]) => mockRemoveChannel(...a), storage: { from: () => ({ upload: jest.fn() }) } } };
});

import { makeCancelFlowDeps, NotCancellableError } from "../services/cancelFlowDeps";
import { useJourney } from "../store/journey";

beforeEach(() => {
  jest.clearAllMocks();
  useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" } });
});

it("createRequest throws NotCancellableError on a 409 and re-applies CANCEL_REQUESTED locally on success", async () => {
  mockPost.mockResolvedValueOnce({ requestId: "r1", asked: 3 });
  const deps = makeCancelFlowDeps();
  const ok = await deps.createRequest("word");
  expect(ok).toEqual({ askedCount: 3 });
  expect(mockSend).toHaveBeenCalledWith({ type: "CANCEL_REQUESTED", method: "word" });

  mockPost.mockRejectedValueOnce(new Error("/api/cancel-request 409"));
  await expect(deps.createRequest("word")).rejects.toBeInstanceOf(NotCancellableError);
});

