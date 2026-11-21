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

// Plain, on-brand HTML. No user-provided value is interpolated into the markup,
// so there is nothing to escape here.
function html(): string {
  return `<!doctype html><html><body style="margin:0;background:#F4F0FA;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1E1340;line-height:1.55">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:28px 26px;box-shadow:0 10px 30px -18px rgba(30,19,64,.4)">
    <div style="font-size:22px;font-weight:800;letter-spacing:.12em;color:#7C3AED;margin-bottom:2px">INNAYA</div>
    <div style="font-size:12px;color:#6B5B95;margin-bottom:20px">Move freely. We've got you.</div>
    <h1 style="font-size:22px;margin:0 0 14px;color:#1E1340">You're on the list.</h1>
    <p style="margin:0 0 14px">Hi,</p>
    <p style="margin:0 0 14px">Thanks for joining. You're on the list for hands-free travel safety, made for women in India.</p>
    <p style="margin:0 0 14px">Tester invites go out every week, oldest sign-ups first. Bring three friends onto the waitlist and you're first in line when the INNAYA jewellery line opens.</p>
    <p style="margin:0 0 14px">We'll be in touch soon.</p>
    <p style="margin:18px 0 0;color:#4B3B77">The INNAYA team</p>
  </div>
  <div style="max-width:520px;margin:14px auto 0;text-align:center;font-size:11px;color:#8B7DB0">We'll only email you about INNAYA. Nothing else.</div>
</body></html>`;
}

export function campaignConfirmation(): { subject: string; html: string } {
  return { subject: SUBJECT, html: html() };
}

export async function sendCampaignConfirmation(to: string): Promise<void> {
  const { subject, html: body } = campaignConfirmation();
  await sendEmail([to], subject, body);
}
