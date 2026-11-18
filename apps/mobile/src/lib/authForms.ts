import { z } from "zod";
import { indianMobile } from "@vaira/core";

// Signup form contract (Task 17). email + Indian mobile + password (>= 8, one
// digit) with a confirm that must match. The refine attaches the mismatch
// message to `confirm` so the screen can surface it under that field.
export const signupSchema = z
  .object({
    email: z.string().email(),
    phone: indianMobile,
    password: z.string().min(8, "At least 8 characters").regex(/\d/, "Include a number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export type SignupInput = z.input<typeof signupSchema>;

// Login accepts an email OR a 10-digit Indian mobile in one field. Anything that
// is not a valid Indian mobile is treated as an email (Supabase auth resolves
// the address), so a 10-digit non-mobile string falls through to email handling.
export function detectIdentifier(s: string): { kind: "email" | "phone" } {
  return { kind: /^[6-9]\d{9}$/.test(s.trim()) ? "phone" : "email" };
}
