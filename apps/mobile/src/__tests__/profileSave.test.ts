// Task 19 — saveProfile writes the profile row and replaces contacts with
// tier/position. Supabase is fully mocked; we assert the exact upsert args and
// that contacts are replaced WITHOUT a delete-first (FD2): upsert on
// (owner_id,phone), then delete only rows whose phone is not in the new list.
// (mock-prefixed names per this project's jest.mock scope rule.)
const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockContactsUpsert = jest.fn().mockResolvedValue({ error: null });
const mockNot = jest.fn().mockResolvedValue({ error: null });
const mockEq = jest.fn().mockReturnValue({ not: mockNot });
const mockDel = jest.fn().mockReturnValue({ eq: mockEq });
jest.mock("../lib/supabase", () => ({
  supabase: {
    from: (t: string) =>
      t === "profiles" ? { upsert: mockUpsert } : { upsert: mockContactsUpsert, delete: mockDel },
  },
}));

import { saveProfile } from "../services/profile";

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
  mockContactsUpsert.mockResolvedValue({ error: null });
  mockNot.mockResolvedValue({ error: null });
  mockEq.mockReturnValue({ not: mockNot });
  mockDel.mockReturnValue({ eq: mockEq });
});

test("saveProfile writes profile and upserts contacts with tier/position", async () => {
  await saveProfile("u1", {
    name: "P",
    age: 25,
    occupation: "Student",
    contacts: [
      { name: "A", phone: "9876543210", email: "", tier: "primary" },
      { name: "B", phone: "9876543211", email: "", tier: "buffer" },
    ],
  });
  expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: "u1", name: "P", age: 25 }));
  expect(mockContactsUpsert).toHaveBeenCalledWith(
    [
      expect.objectContaining({ owner_id: "u1", phone: "9876543210", tier: "primary", position: 0 }),
      expect.objectContaining({ phone: "9876543211", tier: "buffer", position: 0 }),
    ],
    { onConflict: "owner_id,phone" }
  );
});

test("contacts are replaced without a delete-first: upsert then delete-not-in", async () => {
  await saveProfile("u1", {
    name: "P",
    age: 25,
    occupation: "Student",
    contacts: [
      { name: "A", phone: "9876543210", email: "", tier: "primary" },
      { name: "B", phone: "9876543211", email: "", tier: "buffer" },
    ],
  });
  // Removed phones are pruned by deleting rows NOT in the new phone list,
  // scoped to the owner — unchanged rows keep their id/linked_user_id/status.
  expect(mockDel).toHaveBeenCalled();
  expect(mockEq).toHaveBeenCalledWith("owner_id", "u1");
  expect(mockNot).toHaveBeenCalledWith("phone", "in", "(9876543210,9876543211)");
  // Order: the upsert lands before the prune, so a saved contact is never
  // deleted before its replacement exists.
  expect(mockContactsUpsert.mock.invocationCallOrder[0]).toBeLessThan(mockDel.mock.invocationCallOrder[0]);
});

test("primary contacts get sequential positions; empty email becomes null", async () => {
  await saveProfile("u1", {
    name: "P",
    age: 30,
    occupation: "Student",
    contacts: [
      { name: "A", phone: "9876543210", email: "a@b.com", tier: "primary" },
      { name: "B", phone: "9876543211", email: "", tier: "primary" },
    ],
  });
  const rows = mockContactsUpsert.mock.calls[0][0];
  expect(rows[0]).toMatchObject({ position: 0, email: "a@b.com" });
  expect(rows[1]).toMatchObject({ position: 1, email: null });
});

test("throws when the profile upsert errors (never touches contacts)", async () => {
  mockUpsert.mockResolvedValueOnce({ error: { message: "boom" } });
  await expect(
    saveProfile("u1", { name: "P", age: 25, occupation: "Student", contacts: [{ name: "A", phone: "9876543210", email: "", tier: "primary" }] })
  ).rejects.toBeTruthy();
  expect(mockContactsUpsert).not.toHaveBeenCalled();
  expect(mockDel).not.toHaveBeenCalled();
});

test("an upsert failure leaves the existing contacts untouched (no delete)", async () => {
  mockContactsUpsert.mockResolvedValueOnce({ error: { message: "network" } });
  await expect(
    saveProfile("u1", { name: "P", age: 25, occupation: "Student", contacts: [{ name: "A", phone: "9876543210", email: "", tier: "primary" }] })
  ).rejects.toBeTruthy();
  expect(mockDel).not.toHaveBeenCalled();
});
