const sendMail = jest.fn().mockResolvedValue({ messageId: "test-message" });
const createTransport = jest.fn(() => ({ sendMail }));
jest.mock("nodemailer", () => ({ createTransport }));

import { sendEmail } from "@/lib/alerts";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GMAIL_SMTP_USER = "support@example.com";
  process.env.GMAIL_SMTP_PASS = "test-password";
});

test("uses Gmail SMTP and the approved sender identity", async () => {
  await sendEmail(["guardian@example.com"], "Urgent: she needs help", "<a href=\"https://vaira.app/g/token\">Open live status</a>");

  expect(createTransport).toHaveBeenCalledWith({
    service: "gmail",
    auth: { user: "support@example.com", pass: "test-password" },
  });
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: "INNAYA <support@example.com>",
    to: ["guardian@example.com"],
    subject: "Urgent: she needs help",
    html: expect.stringContaining("https://vaira.app/g/token"),
  }));
});

// T-MAIL-1: every email carries a plain-text alternative (no tags, keeps the link URL), a Reply-To,
// and a List-Unsubscribe that is a mailto only — no http(s) one-click target, no List-Unsubscribe-Post.
test("T-MAIL-1: text alternative, Reply-To, and a mailto-only List-Unsubscribe", async () => {
  await sendEmail(["guardian@example.com"], "Urgent: she needs help", '<p>She needs help.</p><p><a href="https://vaira.app/g/token">Open live status</a></p>');
  const msg = sendMail.mock.calls[0][0] as { from: string; text: string; replyTo: string; headers: Record<string, string>; html: string };

  expect(typeof msg.text).toBe("string");
  expect(msg.text.length).toBeGreaterThan(0);
  expect(msg.text).not.toMatch(/<[^>]+>/); // no HTML tags
  expect(msg.text).toContain("https://vaira.app/g/token"); // the link URL survives

  const sender = msg.from.replace(/^.*<(.+)>$/, "$1"); // the address inside `INNAYA <…>`
  expect(msg.replyTo).toBe(sender); // Reply-To is the sender address

  const lu = msg.headers["List-Unsubscribe"];
  expect(lu.startsWith("<mailto:")).toBe(true);
  expect(lu).toContain(sender); // mailto targets the existing sender address
  expect(lu).not.toMatch(/https?:\/\//i); // never a one-click http target
  expect(msg.headers["List-Unsubscribe-Post"]).toBeUndefined();
});

test("does not send when there are no recipients", async () => {
  await sendEmail([], "ignored", "ignored");
  expect(createTransport).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});

test("fails closed when the configured sender is not the approved Gmail account", async () => {
  process.env.GMAIL_SMTP_USER = "wrong@example.com";
  await expect(sendEmail(["guardian@example.com"], "x", "x")).rejects.toThrow("GMAIL_SMTP_USER");
  expect(createTransport).not.toHaveBeenCalled();
});

test("fails closed when the SMTP password is absent", async () => {
  delete process.env.GMAIL_SMTP_PASS;
  delete process.env.SMTP_PASS;
  await expect(sendEmail(["guardian@example.com"], "x", "x")).rejects.toThrow("GMAIL_SMTP_PASS");
  expect(createTransport).not.toHaveBeenCalled();
});
