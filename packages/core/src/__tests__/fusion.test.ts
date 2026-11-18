import { fuseScore } from "../fusion";
test("fusion is max(rules, model)", () => {
  expect(fuseScore(0, 0)).toBe(0);
  expect(fuseScore(2, 1)).toBe(2);
  expect(fuseScore(1, 3)).toBe(3);
});
test("model unavailable (null) counts as 1, never lowers", () => {
  expect(fuseScore(0, null)).toBe(1);
  expect(fuseScore(3, null)).toBe(3);
});
