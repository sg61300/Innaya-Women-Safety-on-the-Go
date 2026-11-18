import { sendEmail } from "./alerts";

// Campaign waitlist confirmation email. Copy is verbatim from vault
// Marketing/landing-page-copy.md (approved draft), including the founder ruling
// 2026-09-24 (referral): the referral reward is jewellery-line priority, NEVER
// queue position / "earlier invite" / "move up the queue". Sent via the existing
// Gmail sender (alerts.sendEmail) — the same transport notifyGuardians uses.
//
// REVEAL rule: this email may state the promise / who it is for / why now / how
// it feels / jewellery-outside-only / the founder's why. It must NEVER mention
// scoring, masking, cancel or vote mechanics, timers, hardware internals, prices,
// or provider/model names.

const SUBJECT = "You're on the INNAYA waitlist.";

// Logo URL is absolute to the live site so Gmail/Outlook can fetch it (a relative
// path never resolves in an email client). The engraved-woman emblem, then the
// INNAYA wordmark in cream, on the app's ink ground (founder s28, item 9).
const EMBLEM = `${process.env.APP_BASE_URL ?? "https://innaya.example.com"}/campaign/emblem-rosegold-alpha-256.png`;

// Table-based, fully inline-styled: no external CSS, so Gmail and Outlook render
// it the same. An ink header band carries the logo; the message sits on white
// below. No user-provided value is interpolated, so there is nothing to escape.
function html(): string {
  return `<!doctype html><html><body style="margin:0;background:#F4F0FA;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1E1340;line-height:1.55">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td align="center">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:100%;border-collapse:collapse;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px -18px rgba(30,19,64,.4)">
    <tr><td align="center" bgcolor="#0C0A1E" style="background:#0C0A1E;padding:30px 26px 24px">
      <img src="${EMBLEM}" width="96" height="96" alt="INNAYA" style="display:block;width:96px;height:96px;margin:0 auto 12px;border:0;outline:none;text-decoration:none" />
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;letter-spacing:.2em;color:#F8F7F3">INNAYA</div>
      <div style="font-size:12px;color:#CB9E80;margin-top:6px">Move freely. We've got you.</div>
    </td></tr>
    <tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;padding:28px 26px;color:#1E1340">
      <h1 style="font-size:22px;margin:0 0 14px;color:#1E1340">You're on the list.</h1>
      <p style="margin:0 0 14px">Hi,</p>
      <p style="margin:0 0 14px">Thanks for joining. You're on the list for hands-free travel safety, made for women in India.</p>
      <p style="margin:0 0 14px">Tester invites go out every week, oldest sign-ups first. Bring three friends onto the waitlist and you're first in line when the INNAYA jewellery line opens.</p>
      <p style="margin:0 0 14px">We'll be in touch soon.</p>
      <p style="margin:18px 0 0;color:#4B3B77">The INNAYA team</p>
    </td></tr>
  </table>
  <div style="max-width:520px;margin:14px auto 0;text-align:center;font-size:11px;color:#8B7DB0">We'll only email you about INNAYA. Nothing else.</div>
  </td></tr></table>
</body></html>`;
}

export function campaignConfirmation(): { subject: string; html: string } {
  return { subject: SUBJECT, html: html() };
}

export async function sendCampaignConfirmation(to: string): Promise<void> {
  const { subject, html: body } = campaignConfirmation();
  await sendEmail([to], subject, body);
}
