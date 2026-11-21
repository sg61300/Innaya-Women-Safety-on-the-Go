// Fix AB / B T1 (founder Q79): the cancel proof uploads into HER OWN folder,
// <her user id>/cancel/<journeyId>/<uuid>.<ext>, because the selfies insert policy
// (0019 selfies_owner_insert) only allows folder 1 = auth.uid().
jest.mock("../services/protocolRunner", () => ({ runner: { send: jest.fn(), verifySafeWord: jest.fn() } }));
jest.mock("../services/gates", () => ({ gates: { verifyPassword: jest.fn() } }));
jest.mock("../services/appPassword", () => ({ resolveAccountEmail: jest.fn().mockResolvedValue("a@b.c") }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));
jest.mock("../lib/api", () => ({ post: jest.fn(), get: jest.fn() }));

const mockUpload = jest.fn();
const mockGetSession = jest.fn();
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a) }) },
  },
}));

import { makeCancelFlowDeps } from "../services/cancelFlowDeps";
import { useJourney } from "../store/journey";

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).fetch = jest.fn().mockResolvedValue({ blob: async () => "BLOB" });
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
  mockUpload.mockResolvedValue({ error: null });
  useJourney.getState().set({ journey: { id: "j1", owner_id: "u1" } });
});

it.each([
  ["photo", "u1/cancel/j1/uuid-1.jpg", "image/jpeg"],
  ["video", "u1/cancel/j1/uuid-1.mp4", "video/mp4"],
] as const)("%s proof uploads to <uid>/cancel/<journeyId>/ and returns that path", async (method, path, type) => {
  const got = await makeCancelFlowDeps().uploadMedia!("file:///x", method);
  expect(got).toBe(path);
  expect(mockUpload).toHaveBeenCalledWith(path, "BLOB", { contentType: type });
});

