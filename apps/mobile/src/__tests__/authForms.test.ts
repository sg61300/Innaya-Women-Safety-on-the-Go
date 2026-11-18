import { signupSchema, detectIdentifier } from "../lib/authForms";

test("signup validation", () => {
  expect(signupSchema.safeParse({ email: "a@b.com", phone: "9876543210", password: "abcdefg1", confirm: "abcdefg1" }).success).toBe(true);
  // phone must be a 10-digit Indian mobile
  expect(signupSchema.safeParse({ email: "a@b.com", phone: "1234", password: "abcdefg1", confirm: "abcdefg1" }).success).toBe(false);
  // password needs a digit
  expect(signupSchema.safeParse({ email: "a@b.com", phone: "9876543210", password: "abcdefgh", confirm: "abcdefgh" }).success).toBe(false);
  // confirm must match
  expect(signupSchema.safeParse({ email: "a@b.com", phone: "9876543210", password: "abcdefg1", confirm: "x" }).success).toBe(false);
  // password shorter than 8 fails
  expect(signupSchema.safeParse({ email: "a@b.com", phone: "9876543210", password: "abc1", confirm: "abc1" }).success).toBe(false);
  // bad email fails
  expect(signupSchema.safeParse({ email: "nope", phone: "9876543210", password: "abcdefg1", confirm: "abcdefg1" }).success).toBe(false);
});

test("identifier detection", () => {
  expect(detectIdentifier("9876543210").kind).toBe("phone");
  expect(detectIdentifier("a@b.com").kind).toBe("email");
  // whitespace is trimmed
  expect(detectIdentifier("  9876543210  ").kind).toBe("phone");
  // a number that is not a valid Indian mobile falls back to email handling
  expect(detectIdentifier("1234567890").kind).toBe("email");
});
