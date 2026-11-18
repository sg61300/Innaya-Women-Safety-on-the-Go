// Task 20 — safety words live on the device (SecureStore); only salted hashes
// leave it. The negative assertion (no plaintext in any payload) is the gate
// that a regression to plaintext sync would trip. FD3 adds the symmetric prune:
// a word the user changed or deleted must stop matching server-side.
const mockMem: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockMem[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockMem[k] = v;
  },
  deleteItemAsync: async (k: string) => {
    delete mockMem[k];
  },
}));
const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
const mockNot = jest.fn().mockResolvedValue({ error: null });
const mockEqKind = jest.fn(() => Object.assign(Promise.resolve({ error: null }), { not: mockNot }));
const mockEqOwner = jest.fn(() => ({ eq: mockEqKind }));
const mockDelete = jest.fn(() => ({ eq: mockEqOwner }));
const mockProfileMaybeSingle = jest.fn().mockResolvedValue({ data: { word_salt: "salt" }, error: null });
const mockProfileEq = jest.fn(() => ({ maybeSingle: mockProfileMaybeSingle }));
const mockProfileSelect = jest.fn(() => ({ eq: mockProfileEq }));
jest.mock("../lib/supabase", () => ({
  supabase: { from: () => ({ upsert: mockUpsert, update: mockUpdate, delete: mockDelete, select: mockProfileSelect }) },
}));

import * as SecureStore from "expo-secure-store";
import { secureWords } from "../services/secureWords";
import { hashWord } from "@vaira/core";

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockMem)) delete mockMem[k];
  mockProfileMaybeSingle.mockResolvedValue({ data: { word_salt: "salt" }, error: null });
});

test("words stay on device, hashes go to server", async () => {
  await secureWords.save("emergency", ["Blue Mango"]);
  await secureWords.save("police_keyword", ["kettle"]);
  expect(await secureWords.get("emergency")).toEqual(["Blue Mango"]);
  await secureWords.syncHashes("u1", "salt", { emergency: ["Blue Mango"], police_keyword: ["kettle"] });
  expect(mockUpsert).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ kind: "emergency", word_hash: hashWord("Blue Mango", "salt") })]),
    expect.anything()
  );
  expect(JSON.stringify(mockUpsert.mock.calls)).not.toContain("Blue Mango");
  expect(JSON.stringify(mockUpsert.mock.calls)).not.toContain("kettle");
});

test("syncHashes hashes the passed words and never reads SecureStore", async () => {
  const spy = jest.spyOn(SecureStore, "getItemAsync");
  await secureWords.syncHashes("u1", "salt", { emergency: ["Blue Mango"], police_keyword: [] });
  expect(spy).not.toHaveBeenCalled();
  expect(mockUpsert).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ kind: "emergency", word_hash: hashWord("Blue Mango", "salt") })]),
    expect.anything()
  );
});

test("normalisation-equal words in one kind upsert as a single row (no 21000)", async () => {
  await secureWords.save("emergency", ["Blue Mango", "blue mango"]);
  await secureWords.syncHashes("u1", "salt", { emergency: ["Blue Mango", "blue mango"], police_keyword: [] });
  const rows = mockUpsert.mock.calls[0][0] as { kind: string; word_hash: string }[];
  const emergency = rows.filter((r) => r.kind === "emergency");
  expect(emergency).toHaveLength(1);
  expect(emergency[0].word_hash).toBe(hashWord("Blue Mango", "salt"));
});

test("a changed word removes its stale hash: delete scoped to owner+kind, stale excluded from the kept set", async () => {
  await secureWords.save("emergency", ["Blue Mango"]);
  await secureWords.syncHashes("u1", "salt", { emergency: ["Blue Mango"], police_keyword: [] });
  const stale = hashWord("Blue Mango", "salt");

  await secureWords.save("emergency", ["Green Papaya"]);
  await secureWords.syncHashes("u1", "salt", { emergency: ["Green Papaya"], police_keyword: [] });
  const kept = hashWord("Green Papaya", "salt");

  // Prune is scoped to this owner and this kind.
  expect(mockEqOwner).toHaveBeenCalledWith("owner_id", "u1");
  expect(mockEqKind).toHaveBeenCalledWith("kind", "emergency");
  // The kept set holds only the current hash; the stale hash is not in it, so
  // the server row for the old word is deleted.
  expect(mockNot).toHaveBeenCalledWith("word_hash", "in", `(${kept})`);
  const emergencyPrunes = mockNot.mock.calls.filter((c) => String(c[2]).includes(kept));
  expect(emergencyPrunes.every((c) => !String(c[2]).includes(stale))).toBe(true);
  expect(kept).not.toBe(stale);

  // Plaintext never appears in any payload — upsert, delete filters, or not().
  const all = JSON.stringify([mockUpsert.mock.calls, mockNot.mock.calls]);
  expect(all).not.toContain("Blue Mango");
  expect(all).not.toContain("Green Papaya");
});

test("get returns [] for an unset kind and never throws on bad JSON", async () => {
  expect(await secureWords.get("are_you_safe")).toEqual([]);
  mockMem["vaira.words.emergency"] = "not json";
  expect(await secureWords.get("emergency")).toEqual([]);
});

test("current journey word verifies from its hash without reading plaintext from the server", async () => {
  const journey = { id: "j1", owner_id: "u1", are_you_safe_word_hash: hashWord("Purple Kettle", "salt") };
  await secureWords.saveJourneySafeWord("j1", "Purple Kettle");
  expect(await secureWords.getJourneySafeWord("j1")).toBe("Purple Kettle");
  await expect(secureWords.verifyJourneySafeWord("purple kettle", journey)).resolves.toBe(true);
  await expect(secureWords.verifyJourneySafeWord("old journey word", journey)).resolves.toBe(false);
  expect(mockProfileSelect).toHaveBeenCalledWith("word_salt");
  expect(JSON.stringify(mockProfileSelect.mock.calls)).not.toContain("Purple Kettle");
});

test("strength meter", () => {
  expect(secureWords.strength("ok")).toBe("weak");
  expect(secureWords.strength("blue")).toBe("ok");
  expect(secureWords.strength("purple kettle sings")).toBe("strong");
});
