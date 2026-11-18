import { profileSchema, normalisePlate, plateSchema } from "../validators";
const contact = (phone: string, tier: "primary"|"buffer" = "primary") => ({ name: "A", phone, email: "a@x.com", tier });
test("valid profile passes", () => {
  expect(profileSchema.safeParse({ name: "Priya", age: 24, occupation: "Working professional", contacts: [contact("9876543210")] }).success).toBe(true);
});
test("age must be integer 18-120, letters rejected", () => {
  expect(profileSchema.safeParse({ name: "P", age: "abc", occupation: "Student", contacts: [contact("9876543210")] }).success).toBe(false);
  expect(profileSchema.safeParse({ name: "P", age: 17, occupation: "Student", contacts: [contact("9876543210")] }).success).toBe(false);
});
test("contacts: at least one primary, max 10 primary, max 5 buffer, unique phones", () => {
  expect(profileSchema.safeParse({ name: "P", age: 30, occupation: "Other", contacts: [] }).success).toBe(false);
  const eleven = Array.from({ length: 11 }, (_, i) => contact(`98765432${String(i).padStart(2,"0")}`));
  expect(profileSchema.safeParse({ name: "P", age: 30, occupation: "Other", contacts: eleven }).success).toBe(false);
  expect(profileSchema.safeParse({ name: "P", age: 30, occupation: "Other", contacts: [contact("9876543210"), contact("9876543210")] }).success).toBe(false);
});
test("plate normalisation", () => {
  expect(normalisePlate(" mh 01 ab-1234 ")).toBe("MH01AB1234");
  expect(plateSchema.safeParse("MH01AB1234").success).toBe(true);
  expect(plateSchema.safeParse("12345").success).toBe(false);
});
test("plate schema accepts lowercase-with-spaces after normalisation", () => {
  expect(plateSchema.safeParse(" ka 05 cd 5678 ").success).toBe(true);
});
