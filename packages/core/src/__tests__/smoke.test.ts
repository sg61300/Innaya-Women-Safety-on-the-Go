import { CORE_VERSION } from "../index";

test("core package loads", () => {
  expect(CORE_VERSION).toBe("0.1.0");
});
