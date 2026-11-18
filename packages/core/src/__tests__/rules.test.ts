import { matchKeyword, isGuessableSafeWord, hrRule, BUILTIN_TRIGGERS } from "../rules";
test("matchKeyword finds configured or built-in words inside a transcript", () => {
  expect(matchKeyword("i said blue mango now", ["Blue Mango"])).toBe("blue mango");
  expect(matchKeyword("please HELP me", [...BUILTIN_TRIGGERS])).toBe("help");
  expect(matchKeyword("all fine here", ["blue mango"])).toBeNull();
});
test("matchKeyword does not match inside another word", () => {
  expect(matchKeyword("that was helpful", ["help"])).toBeNull();
});
test("guessable safe words are rejected", () => {
  expect(isGuessableSafeWord("safe", [])).toEqual({ ok: false, reason: "common" });
  expect(isGuessableSafeWord("I am ok", [])).toEqual({ ok: false, reason: "common" });
  expect(isGuessableSafeWord("ab", [])).toEqual({ ok: false, reason: "too_short" });
  expect(isGuessableSafeWord("blue mango", ["blue mango"])).toEqual({ ok: false, reason: "equals_emergency" });
  expect(isGuessableSafeWord("purple kettle", ["blue mango"])).toEqual({ ok: true });
});
test("HR rule: +35 bpm over baseline sustained 20 s, or >140 at rest", () => {
  expect(hrRule(106, 70, 25)).toBe(1); // +36 sustained 25 s
  expect(hrRule(105, 70, 25)).toBe(0); // +35 exactly is not "> +35"
  expect(hrRule(100, 70, 25)).toBe(0); // +30 (the plan's original value) must NOT fire
  expect(hrRule(100, 70, 10)).toBe(0);
  expect(hrRule(145, 70, 0)).toBe(1);
  expect(hrRule(90, 70, 60)).toBe(0);
});
test("matchKeyword works for Hindi words with matras", () => {
  expect(matchKeyword("मुझे सुरक्षा चाहिए", ["सुरक्षा"])).toBe("सुरक्षा");
});
