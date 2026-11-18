import { z } from "zod";
export const indianMobile = z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number");
export const contactSchema = z.object({
  name: z.string().min(1), phone: indianMobile,
  // Guardian email is optional in the profile form. Keep validation strict
  // when a value is supplied, while allowing the blank default used by the UI.
  email: z.union([z.string().email("Enter a valid guardian email"), z.literal("")]),
  tier: z.enum(["primary","buffer"]).default("primary"),
});
export const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.number({ invalid_type_error: "Numbers only, please" }).int().min(18).max(120),
  occupation: z.enum(["Working professional","Self-employed","Business","Student","Other"]),
  company: z.string().optional(),
  howHeard: z.string().optional(),
  selfDefence: z.object({ trained: z.boolean(), discipline: z.string().optional(), level: z.string().optional(), duration: z.string().optional() }).optional(),
  tools: z.array(z.string()).optional(),
  contacts: z.array(contactSchema).superRefine((cs, ctx) => {
    const primaries = cs.filter(c => c.tier === "primary"), buffers = cs.filter(c => c.tier === "buffer");
    if (primaries.length < 1) ctx.addIssue({ code: "custom", message: "Add at least one emergency contact" });
    if (primaries.length > 10) ctx.addIssue({ code: "custom", message: "Up to 10 emergency contacts" });
    if (buffers.length > 5) ctx.addIssue({ code: "custom", message: "Up to 5 buffer contacts" });
    if (new Set(cs.map(c => c.phone)).size !== cs.length) ctx.addIssue({ code: "custom", message: "Duplicate phone number" });
  }),
});
export type ProfileInput = z.infer<typeof profileSchema>;
export function normalisePlate(p: string): string { return p.toUpperCase().replace(/[^A-Z0-9]/g, ""); }
export const plateSchema = z.string().transform(normalisePlate).pipe(z.string().regex(/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/));
