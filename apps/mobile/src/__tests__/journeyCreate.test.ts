// Task 23 — journey setup service. etaSeconds/validateSafeWord are the pure
// gate functions (Step 1 of the brief). createJourney is exercised with a fully
// mocked supabase/secureWords/api stack to prove the row insert, the blacklist
// and danger-zone checks, the selfie upload, the safe-word gate and the
// monitoring request all fire in the right order and shape.
const mockInsertSingle = jest.fn();
const mockInsert = jest.fn(() => ({ select: () => ({ single: mockInsertSingle }) }));
const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null });
const mockRpc = jest.fn().mockResolvedValue({ data: [] });
const mockUpload = jest.fn().mockResolvedValue({ error: null });

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: (t: string) => {
      if (t === "blacklisted_vehicles")
        return { select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) };
      // journeys: both insert(...).select(...).single() and update(...).eq(...)
      return {
        insert: mockInsert,
        update: () => ({ eq: mockUpdateEq }),
      };
    },
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: { from: () => ({ upload: (...a: unknown[]) => mockUpload(...a) }) },
  },
}));

const mockWordsGet = jest.fn().mockResolvedValue([]);
const mockWordsSave = jest.fn().mockResolvedValue(undefined);
const mockSaveJourneySafeWord = jest.fn().mockResolvedValue(undefined);
jest.mock("../services/secureWords", () => ({
  secureWords: {
    get: (...a: unknown[]) => mockWordsGet(...a),
    save: (...a: unknown[]) => mockWordsSave(...a),
    saveJourneySafeWord: (...a: unknown[]) => mockSaveJourneySafeWord(...a),
  },
}));

const mockPost = jest.fn().mockResolvedValue({});
jest.mock("../lib/api", () => ({ post: (...a: unknown[]) => mockPost(...a) }));

const mockLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../lib/events", () => ({ events: { log: (...a: unknown[]) => mockLog(...a) } }));

// global fetch → blob for the selfie upload
(globalThis as any).fetch = jest.fn().mockResolvedValue({ blob: async () => new Blob(["x"]) });

import { etaSeconds, validateSafeWord, createJourney, haversineM, isBlacklisted, isValidCoordinate } from "../services/journey";

const HERE = { lat: 19.07, lng: 72.87, label: "Home" };
const THERE = { lat: 19.09, lng: 72.9, label: "Office" };
const input = () => ({
  from: HERE,
  to: THERE,
  startAt: new Date("2026-09-05T10:00:00Z"),
  leavingNow: true,
  mode: "cab",
  safeWord: "purple kettle",
  selfieUri: "file:///selfie.jpg",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockInsertSingle.mockResolvedValue({ data: { id: "j1" }, error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
  mockMaybeSingle.mockResolvedValue({ data: null });
  mockRpc.mockResolvedValue({ data: [] });
  mockUpload.mockResolvedValue({ error: null });
  mockWordsGet.mockResolvedValue([]);
  mockSaveJourneySafeWord.mockResolvedValue(undefined);
});

test("eta from distance at 25 km/h, min 10 min", () => {
  expect(etaSeconds({ lat: 19.07, lng: 72.87 }, { lat: 19.07, lng: 72.87 })).toBe(600);
  expect(etaSeconds({ lat: 19.0, lng: 72.8 }, { lat: 19.2, lng: 72.8 })).toBeGreaterThan(3000);
});

test("safe word must not be guessable or an emergency word", () => {
  expect(validateSafeWord("safe", ["blue mango"])).toEqual({ ok: false, reason: "common" });
  expect(validateSafeWord("blue mango", ["blue mango"])).toEqual({ ok: false, reason: "equals_emergency" });
  expect(validateSafeWord("purple kettle", ["blue mango"])).toEqual({ ok: true });
});

test("haversineM is symmetric and zero for identical points", () => {
  expect(haversineM(HERE, HERE)).toBe(0);
  expect(haversineM(HERE, THERE)).toBeCloseTo(haversineM(THERE, HERE), 6);
});

test.each([
  { lat: Number.NaN, lng: 77.5 },
  { lat: 91, lng: 77.5 },
  { lat: 12.9, lng: 181 },
])("rejects invalid coordinate values before persistence", (point) => {
  expect(isValidCoordinate(point)).toBe(false);
});

test("createJourney inserts the row, uploads the selfie, logs and requests monitoring", async () => {
  const r = await createJourney("u1", "salt", input());
  expect(r).toEqual({ id: "j1", dangerZone: false, blacklisted: false });
  expect(mockInsertSingle).toHaveBeenCalledTimes(1);
  expect(mockUpload).toHaveBeenCalledTimes(1);
  // T2: selfie is uploaded FIRST and the insert already carries its path; no update.
  const uploadedPath = (mockUpload.mock.calls[0] as unknown[])[0] as string;
  expect(uploadedPath).toMatch(/^u1\/\d+-[a-z0-9]+\.jpg$/);
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect((mockInsert.mock.calls[0] as unknown[])[0]).toEqual(expect.objectContaining({
    selfie_url: uploadedPath,
    from_label: "Home",
    to_label: "Office",
    from_geo: "POINT(72.87 19.07)",
    to_geo: "POINT(72.9 19.09)",
  }));
  expect(mockUpdateEq).not.toHaveBeenCalled();
  expect(mockWordsSave).toHaveBeenCalledWith("are_you_safe", ["purple kettle"]);
  expect(mockSaveJourneySafeWord).toHaveBeenCalledWith("j1", "purple kettle");
  expect(mockLog).toHaveBeenCalledWith("journey_created", expect.objectContaining({ dangerZone: false, blacklisted: false }), "j1");
  expect(mockPost).toHaveBeenCalledWith("/api/monitoring", { action: "request", journeyId: "j1" });
});

test("createJourney rejects a safe word that equals an emergency word (no insert)", async () => {
  mockWordsGet.mockResolvedValue(["purple kettle"]);
  await expect(createJourney("u1", "salt", input())).rejects.toThrow("safe_word_equals_emergency");
  expect(mockInsertSingle).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});

test("isBlacklisted is true when the plate row exists, false otherwise (normalised)", async () => {
  mockMaybeSingle.mockResolvedValue({ data: { plate_norm: "MH01AB1234" } });
  expect(await isBlacklisted("mh 01 ab 1234")).toBe(true);
  mockMaybeSingle.mockResolvedValue({ data: null });
  expect(await isBlacklisted("mh 01 ab 1234")).toBe(false);
});

test("createJourney rejects when the profile salt is empty (no upload, no insert)", async () => {
  await expect(createJourney("u1", "", input())).rejects.toThrow("profile_salt_missing");
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockInsert).not.toHaveBeenCalled();
});

test("createJourney rejects invalid coordinates before upload or insert", async () => {
  await expect(createJourney("u1", "salt", { ...input(), from: { ...HERE, lat: 999 } })).rejects.toThrow("invalid_coordinates");
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockInsert).not.toHaveBeenCalled();
});

test("createJourney flags a blacklisted plate", async () => {
  mockMaybeSingle.mockResolvedValue({ data: { plate_norm: "MH01AB1234" } });
  const r = await createJourney("u1", "salt", { ...input(), plate: "mh 01 ab 1234" });
  expect(r.blacklisted).toBe(true);
});

test("createJourney appends the safe word to the are_you_safe history", async () => {
  mockWordsGet.mockImplementation((k: string) => Promise.resolve(k === "are_you_safe" ? ["alpha"] : []));
  await createJourney("u1", "salt", { ...input(), safeWord: "green lantern" });
  expect(mockWordsSave).toHaveBeenCalledWith("are_you_safe", ["alpha", "green lantern"]);
});

test("createJourney does not re-add a safe word already in history (case-insensitive)", async () => {
  mockWordsGet.mockImplementation((k: string) => Promise.resolve(k === "are_you_safe" ? ["Green Lantern"] : []));
  await createJourney("u1", "salt", { ...input(), safeWord: "green lantern" });
  expect(mockWordsSave).not.toHaveBeenCalled();
});

test("createJourney flags a danger zone when a red region is near either end", async () => {
  mockRpc.mockResolvedValueOnce({ data: [{ status: "red" }] }).mockResolvedValue({ data: [] });
  const r = await createJourney("u1", "salt", input());
  expect(r.dangerZone).toBe(true);
});

test("createJourney surfaces the insert error and never requests monitoring", async () => {
  mockInsertSingle.mockResolvedValue({ data: null, error: { message: "quota_exceeded" } });
  await expect(createJourney("u1", "salt", input())).rejects.toBeTruthy();
  expect(mockPost).not.toHaveBeenCalled();
});

test("createJourney rejects when the selfie upload fails and never inserts or requests monitoring", async () => {
  mockUpload.mockResolvedValue({ error: { message: "x" } });
  await expect(createJourney("u1", "salt", input())).rejects.toThrow("selfie_upload_failed");
  expect(mockInsert).not.toHaveBeenCalled();
  expect(mockPost).not.toHaveBeenCalled();
});
