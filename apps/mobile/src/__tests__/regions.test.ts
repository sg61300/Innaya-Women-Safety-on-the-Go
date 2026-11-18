jest.mock("../lib/supabase", () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock("../lib/events", () => ({ events: { log: jest.fn() } }));

import { regionColour, histogram, nearestCity, regions } from "../services/regions";
import { supabase } from "../lib/supabase";

test("colours and histogram", () => {
  expect(regionColour("red").fill).toBe("rgba(193,18,31,0.35)");
  expect(regionColour("amber").fill).toBe("rgba(242,201,76,0.35)");
  expect(regionColour("safe_by_police").dashed).toBe(true);
  expect(histogram([{ reason: "harassment" }, { reason: "harassment" }, { reason: "stalking" }])).toEqual({ harassment: 2, stalking: 1 });
});

test("amber and red are not dashed", () => {
  expect(regionColour("red").dashed).toBe(false);
  expect(regionColour("amber").dashed).toBe(false);
});

// D1: new user reports must carry the city so the city chips filter them
// correctly (unsafe_regions.city is `not null default 'Delhi'`).
test("nearestCity picks the nearest centre within 50 km, else Other", () => {
  expect(nearestCity(12.98, 77.6)).toBe("Bengaluru");
  expect(nearestCity(0, 0)).toBe("Other");
});

test("report() inserts a fresh region carrying its city", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: [] }); // no region within 150 m
  const insertRegion = jest.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: "new1" } }) }) });
  const insertReport = jest.fn().mockResolvedValue({ error: null });
  (supabase.from as jest.Mock).mockImplementation((t: string) =>
    t === "unsafe_regions" ? { insert: insertRegion } : { insert: insertReport });
  await regions.report({ lat: 12.98, lng: 77.6, radiusM: 150, reason: "harassment" }, "u1");
  expect(insertRegion).toHaveBeenCalledWith(expect.objectContaining({ city: "Bengaluru" }));
});

// D2: a failed report insert must not leave an orphan amber region behind, but a
// pre-existing region must survive.
test("report() deletes a freshly created region when the report insert fails", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: [] }); // no existing region → fresh insert
  const eq = jest.fn().mockResolvedValue({ error: null });
  const del = jest.fn().mockReturnValue({ eq });
  const insertRegion = jest.fn().mockReturnValue({ select: () => ({ single: () => Promise.resolve({ data: { id: "new1" } }) }) });
  const insertReport = jest.fn().mockResolvedValue({ error: new Error("boom") });
  (supabase.from as jest.Mock).mockImplementation((t: string) =>
    t === "unsafe_regions" ? { insert: insertRegion, delete: del } : { insert: insertReport });
  await expect(regions.report({ lat: 12.98, lng: 77.6, radiusM: 150, reason: "harassment" }, "u1")).rejects.toBeTruthy();
  expect(eq).toHaveBeenCalledWith("id", "new1");
});

test("report() does NOT delete a pre-existing region when the report insert fails", async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: [{ id: "existing1" }] }); // region pre-exists
  const del = jest.fn();
  const insertReport = jest.fn().mockResolvedValue({ error: new Error("boom") });
  (supabase.from as jest.Mock).mockImplementation((t: string) =>
    t === "unsafe_regions" ? { delete: del } : { insert: insertReport });
  await expect(regions.report({ lat: 12.98, lng: 77.6, radiusM: 150, reason: "harassment" }, "u1")).rejects.toBeTruthy();
  expect(del).not.toHaveBeenCalled();
});

// D3: the seed migration and the JSON must not drift — both carry 45 placeholder
// rows. Counting "placeholder NN" in the SQL guards the VALUES list.
declare const __dirname: string; // provided by jest's CommonJS runtime; no @types/node in this project
test("0017 seed migration carries 45 placeholder rows (JSON/SQL cannot drift)", () => {
  const fs = require("fs");
  const path = require("path");
  const sql = fs.readFileSync(path.resolve(__dirname, "../../../../supabase/migrations/0017_regions_seed.sql"), "utf8");
  expect((sql.match(/placeholder \d\d/g) ?? []).length).toBe(45);
});

// Seed: 45 placeholder rows, 15 per pilot city, none red, all founder_filled:false.
test("seed has 45 rows, 15 per city, none red, none founder-filled", () => {
  const seed = require("../data/regions.seed.json") as { city: string; status: string; founder_filled: boolean; name: string }[];
  expect(seed).toHaveLength(45);
  for (const city of ["Delhi", "Ghaziabad", "Bengaluru"]) {
    expect(seed.filter((s) => s.city === city)).toHaveLength(15);
  }
  expect(seed.every((s) => s.status !== "red")).toBe(true);
  expect(seed.every((s) => s.founder_filled === false)).toBe(true);
  expect(seed.every((s) => /placeholder \d\d$/.test(s.name))).toBe(true);
});

// F12 (b16): a user's own reports, newest first, with the embedded area.
test("myReports() queries own rows newest first and returns the embedded region", async () => {
  const order = jest.fn().mockResolvedValue({ data: [{ reason: "stalking", ts: "2026-09-08T00:00:00Z", region: { name: "MG Road", status: "amber", lat: 12.9, lng: 77.6 } }] });
  const eq = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ eq });
  (supabase.from as jest.Mock).mockReturnValue({ select });
  const rows = await regions.myReports("u1");
  expect(supabase.from).toHaveBeenCalledWith("unsafe_reports");
  expect(eq).toHaveBeenCalledWith("reporter_id", "u1");
  expect(order).toHaveBeenCalledWith("ts", { ascending: false });
  expect(rows[0].region?.name).toBe("MG Road");
});
