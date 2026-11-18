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
  expect(sendMail).toHaveBeenCalledWith({
    from: "INNAYA <support@example.com>",
    to: ["guardian@example.com"],
    subject: "Urgent: she needs help",
    html: expect.stringContaining("https://vaira.app/g/token"),
  });
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
