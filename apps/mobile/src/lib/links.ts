// Deep-link builders for the +91 (India) pilot. WhatsApp wants a bare 91-prefixed
// number; the dialer wants an E.164 tel: URI. Both are passed to Linking.openURL.
// Strip separators and any 91 already present on a 10-digit national number so a
// formatted or pre-prefixed contact is never double-prefixed.
const digits = (p: string) => p.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
export const links = {
  whatsapp: (p: string) => `whatsapp://send?phone=91${digits(p)}`,
  tel: (p: string) => `tel:+91${digits(p)}`,
  support: () => `mailto:${process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "support@example.com"}?subject=${encodeURIComponent("INNAYA support or suggestion")}`,
};
