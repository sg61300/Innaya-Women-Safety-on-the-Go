import { sortByDistance, defence } from "../services/defence";

test("sorts by distance", () => {
  const r = sortByDistance(
    [{ name: "far", lat: 19.3, lng: 72.8 }, { name: "near", lat: 19.071, lng: 72.871 }],
    { lat: 19.07, lng: 72.87 }
  );
  expect(r.map((x) => x.name)).toEqual(["near", "far"]);
  expect(r[0].distanceM).toBeLessThan(200);
});

test("classes come back nearest-first with a distance", () => {
  const list = defence.classes(28.6139, 77.209);
  expect(list.length).toBe(6);
  for (let i = 1; i < list.length; i++) expect(list[i].distanceM).toBeGreaterThanOrEqual(list[i - 1].distanceM);
});

test("tools list has 5 entries and marks the taser restricted", () => {
  const tools = defence.tools();
  expect(tools).toHaveLength(5);
  const taser = tools.find((t) => /taser/i.test(t.name));
  expect(taser?.legal).toBe("restricted");
  expect(tools.every((t) => t.amazonUrl.startsWith("https://www.amazon.in/"))).toBe(true);
});
