import { CITY_OPTIONS, cityFromCoords } from "../lib/cities";
test("pilot cities present and GPS maps into them", () => {
  const keys = CITY_OPTIONS.map(c => c.value);
  for (const k of ["delhi", "ghaziabad", "bengaluru", "other"]) expect(keys).toContain(k);
  expect(cityFromCoords(12.9716, 77.5946)).toBe("bengaluru");
  expect(cityFromCoords(28.6692, 77.4538)).toBe("ghaziabad");
  expect(cityFromCoords(28.6139, 77.2090)).toBe("delhi");
  expect(cityFromCoords(0, 0)).toBe("other");
});
