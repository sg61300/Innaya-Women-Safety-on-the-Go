import { createHash } from "crypto";
import { z } from "zod";
import { admin } from "@/lib/supabaseAdmin";
import { trackOne } from "@/lib/mixpanel";
import { sendCampaignConfirmation } from "@/lib/waitlistEmail";

// ── Contract (for the products form lane) ────────────────────────────────────
// POST /api/waitlist   Content-Type: application/json
// Request:  { name, email?, phone?, city?, product, tier, consent, source? }
//   name    2–80 chars                          email   valid email (email OR phone required)
//   phone   Indian mobile ^(?:\+?91)?[6-9]\d{9}$ (bare 10-digit or +91), stored as +91XXXXXXXXXX
//   product one of: pendant|brooch|bangle|patch|eye|kit
//   tier    one of: standard|luxury|haute       consent must be true
// Response: 200 { ok:true }                 happy path (row inserted)
//           200 { ok:true, duplicate:true }  email/phone already on the list
//           400 { ok:false, errors:{field:[msg]} }  validation failure
//           429 { ok:false, error:"rate_limited" }   >5 requests/hour from one IP
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCTS = ["pendant", "brooch", "bangle", "patch", "eye", "kit"] as const;
const TIERS = ["standard", "luxury", "haute"] as const;
const PHONE_RE = /^(?:\+?91)?[6-9]\d{9}$/;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Normalise an Indian mobile to +91XXXXXXXXXX (last 10 digits, always +91 prefix).
const normPhone = (raw: string) => "+91" + raw.replace(/\D/g, "").slice(-10);

const Body = z
  .object({
    name: z.string().trim().min(2, "min 2 chars").max(80, "max 80 chars").optional(),
    email: z.string().trim().email("invalid email").optional(),
    phone: z.string().trim().regex(PHONE_RE, "invalid Indian mobile").optional(),
    city: z.string().trim().max(120).optional(),
    product: z.enum(PRODUCTS, { errorMap: () => ({ message: "unknown product" }) }).optional(),
    tier: z.enum(TIERS, { errorMap: () => ({ message: "unknown tier" }) }).optional(),
    consent: z.literal(true, { errorMap: () => ({ message: "consent required" }) }),
    source: z.string().trim().max(120).optional(),
    // Metrics attribution: user_id when the visitor is signed in, else an
    // anonymous per-browser visitor_id so M6 shares a denominator with
    // products_opened. Both optional; the row itself is the product_registered
    // record even when neither is present ("count by the waitlist table").
    user_id: z.string().trim().uuid().optional(),
    visitor_id: z.string().trim().max(64).optional(),
  })
  // Two callers share this route. The products form (any non-"campaign" source)
  // requires name + product + tier and accepts email OR phone. The campaign
  // landing page (source "campaign") collects only email (+ optional city); its
  // name/product/tier are defaulted server-side, so those three are optional in
  // the schema and required per-source here, and email is mandatory for campaign.
  .superRefine((d, ctx) => {
    const campaign = d.source === "campaign";
    if (!campaign) {
      if (!d.name) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "min 2 chars" });
      if (!d.product) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["product"], message: "unknown product" });
      if (!d.tier) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tier"], message: "unknown tier" });
      if (!d.email && !d.phone) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "email or phone required" });
    } else if (!d.email) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "email required" });
    }
  });

// In-memory per-IP rate limit: 5 requests/hour, keyed by sha256(ip). This is a
// single-instance pilot limiter, it resets on redeploy and is NOT shared across
// serverless instances. Move to a shared store (Redis/DB) before scaling out.
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ipHash: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ipHash) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ipHash, recent);
    return true;
  }
  recent.push(now);
  hits.set(ipHash, recent);
  return false;
}

// Fire-and-forget: write a site event row (no journey) and mirror it to Mixpanel.
// The events row id is the Mixpanel $insert_id so Mixpanel dedupes. Never blocks
// or fails the response. Used for product_registered (fresh reservation only) and
// waitlist_form_submitted (every valid submit, incl. a duplicate).
function recordEvent(
  type: string,
  userId: string | null,
  distinctId: string | null,
  props: Record<string, unknown>,
): void {
  void (async () => {
    try {
      const { data: evt } = await admin()
        .from("events")
        .insert({ type, user_id: userId, payload: props })
        .select("id")
        .single();
      void trackOne({
        event: type,
        distinctId,
        insertId: (evt as { id?: string } | null)?.id?.toString() ?? null,
        props,
      });
    } catch (e) {
      console.warn("[waitlist] metrics record failed", e instanceof Error ? e.message : "error");
    }
  })();
}

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const ipHash = sha256(ip);

    if (rateLimited(ipHash)) {
      return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return Response.json({ ok: false, errors: { _body: ["invalid json"] } }, { status: 400 });
    }

    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      // field errors only, never echo the submitted PII back.
      return Response.json({ ok: false, errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const d = parsed.data;

    // Campaign signups collect only email (+ optional city); default the three
    // hardware-only columns so the shared table stays satisfiable. name falls back
    // to the email local-part (something human for the founder to read), product to
    // the generic "kit", tier to "standard". Non-campaign rows keep the submitted
    // values (guaranteed present by the superRefine above).
    const campaign = d.source === "campaign";
    const nameToStore = d.name ?? (d.email ? d.email.split("@")[0] : "waitlist");
    const productToStore = d.product ?? "kit";
    const tierToStore = d.tier ?? "standard";

    // distinct_id is the signed-in user or the anonymous visitor id. props carry
    // product slug + tier + visitor_id (R64) so m8/m9/m10 can attribute.
    const distinctId = d.user_id ?? d.visitor_id ?? null;
    const props = { product: productToStore, tier: tierToStore, source: d.source ?? null, visitor_id: d.visitor_id ?? null };

    const { data: inserted, error } = await admin()
      .from("hardware_interest")
      .insert({
        name: nameToStore,
        email: d.email ? d.email.toLowerCase() : null,
        phone: d.phone ? normPhone(d.phone) : null,
        city: d.city ?? null,
        product: productToStore,
        tier: tierToStore,
        consent: d.consent,
        source: d.source ?? null,
        user_id: d.user_id ?? null,
        ip_hash: ipHash,
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation. Treat as an idempotent success so we never
      // reveal whether a given email/phone is already on the list. A duplicate is
      // not a fresh registration, so it is NOT counted for M6.
      if ((error as { code?: string }).code === "23505") {
        // A duplicate is not a fresh registration (no product_registered, so M6 is
        // untouched), but the form WAS submitted, so waitlist_form_submitted fires
        // (m8/m9/m10 count form submissions, not fresh rows).
        recordEvent("waitlist_form_submitted", d.user_id ?? null, distinctId, props);
        return Response.json({ ok: true, duplicate: true });
      }
      // Log the code only, no PII, no row values.
      console.error("[waitlist] insert failed", (error as { code?: string }).code ?? "unknown");
      return Response.json({ ok: false, error: "server_error" }, { status: 500 });
    }

    // Fresh insert. A campaign signup is a waitlist email, not a hardware
    // reservation, so it does NOT count toward product_registered (M6); the
    // products form still does. Both paths record waitlist_form_submitted. A fresh
    // campaign signup also gets the confirmation email (fire-and-forget: a mail
    // failure never fails the request or the row).
    void inserted;
    if (!campaign) recordEvent("product_registered", d.user_id ?? null, distinctId, props);
    recordEvent("waitlist_form_submitted", d.user_id ?? null, distinctId, props);
    if (campaign && d.email) {
      const to = d.email.toLowerCase();
      void (async () => {
        try {
          await sendCampaignConfirmation(to);
        } catch (e) {
          console.warn("[waitlist] confirmation email failed", e instanceof Error ? e.message : "error");
        }
      })();
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error("[waitlist]", e instanceof Error ? e.message : "error");
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
