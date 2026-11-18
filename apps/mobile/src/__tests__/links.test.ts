import { links } from "../lib/links";

test("deep links", () => {
  expect(links.whatsapp("9876543210")).toBe("whatsapp://send?phone=919876543210");
  expect(links.tel("9876543210")).toBe("tel:+919876543210");
});

// D9: strip separators and an existing 91 country code so we never double-prefix.
test("normalizes formatted and already-prefixed numbers", () => {
  expect(links.tel("+91 98765 43210")).toBe("tel:+919876543210");
  expect(links.whatsapp("+91 98765 43210")).toBe("whatsapp://send?phone=919876543210");
  expect(links.tel("9876543210")).toBe("tel:+919876543210"); // bare 10-digit unchanged
});
