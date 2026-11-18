import { hashWord, normaliseWord } from "../hash";
test("normalise strips case, punctuation, extra spaces", () => {
  expect(normaliseWord("  Blue   Mango!! ")).toBe("blue mango");
});
test("hash is deterministic and salted", () => {
  const a = hashWord("Blue Mango", "s1"), b = hashWord("blue mango", "s1"), c = hashWord("blue mango", "s2");
  expect(a).toBe(b); expect(a).not.toBe(c); expect(a).toHaveLength(64);
});
test("normalise keeps Devanagari base letters and strips punctuation", () => {
  expect(normaliseWord(" मदद! ")).toBe("मदद");
});
test("normalise keeps Indic combining marks (matras, virama)", () => {
  expect(normaliseWord("सुरक्षा")).toBe("सुरक्षा");
  expect(normaliseWord(" ಸಹಾಯ! ")).toBe("ಸಹಾಯ");
  expect(hashWord("सुरक्षा", "s")).toBe(hashWord(" सुरक्षा ", "s"));
});
