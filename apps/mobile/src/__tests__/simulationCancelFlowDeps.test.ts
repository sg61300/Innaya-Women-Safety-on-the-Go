// Lane E3 / X5a — the SIMULATION cancel/proof deps never touch a guardian endpoint.
// uploadMedia posts ONLY to /api/simulate-proof; createRequest (guardian request)
// throws; there is no verdict subscription; the password gate is local-only.
const mockPost = jest.fn().mockResolvedValue({ ok: true, sentTo: "me@example.com" });
const mockVerifySafeWord = jest.fn().mockResolvedValue(true);
const mockVerifyAppPasswordLocal = jest.fn().mockResolvedValue(null);
jest.mock("../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));
jest.mock("../services/protocolRunner", () => ({ runner: { verifySafeWord: (...a: unknown[]) => mockVerifySafeWord(...a) } }));
jest.mock("../services/appPassword", () => ({ verifyAppPasswordLocal: (...a: unknown[]) => mockVerifyAppPasswordLocal(...a) }));
jest.mock("expo-file-system/legacy", () => ({ readAsStringAsync: jest.fn().mockResolvedValue("BASE64DATA") }));

import { makeSimulationCancelFlowDeps } from "../services/simulationCancelFlowDeps";

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ ok: true, sentTo: "me@example.com" });
  mockVerifyAppPasswordLocal.mockResolvedValue(null);
});

it("uploadMedia posts to /api/simulate-proof (NOT /api/cancel-request) and returns the recipient", async () => {
  const deps = makeSimulationCancelFlowDeps();
  const to = await deps.uploadMedia!("file:///proof.jpg", "photo");
  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockPost).toHaveBeenCalledWith("/api/simulate-proof", { kind: "photo", media: "BASE64DATA" });
  // proves it NEVER hits the guardian cancel endpoint
  expect(mockPost.mock.calls.some((c) => String(c[0]).includes("cancel-request"))).toBe(false);
  expect(to).toBe("me@example.com");
});

it("createRequest throws — a drill can never open a guardian cancel request", async () => {
  const deps = makeSimulationCancelFlowDeps();
  await expect(deps.createRequest("photo", "x")).rejects.toThrow(/simulation must not/i);
  expect(mockPost).not.toHaveBeenCalled();
});

it("subscribeVerdict is an inert no-op (no guardian verdict subscription)", () => {
  const deps = makeSimulationCancelFlowDeps();
  const off = deps.subscribeVerdict(() => { throw new Error("must not fire"); });
  expect(typeof off).toBe("function");
  off();
});

it("verifyPassword is local-only: true when no local hash, false when the local hash rejects", async () => {
  const deps = makeSimulationCancelFlowDeps();
  expect(await deps.verifyPassword("pw")).toBe(true); // null → proceed
  mockVerifyAppPasswordLocal.mockResolvedValue(false);
  expect(await deps.verifyPassword("pw")).toBe(false);
  expect(mockPost).not.toHaveBeenCalled(); // no server/guardian call from the gate
});
