"use client";

import { useEffect, useRef, useState } from "react";
import { PRODUCTS } from "@/products/catalog";

// "Express your interest" form (copy §6), wired to POST /api/waitlist.
// Rules mirror the route: name 2–80; email OR phone required (Indian mobile
// ^(?:\+?91)?[6-9]\d{9}$); product ∈ catalog slugs; tier ∈ standard|luxury|haute;
// consent must be true. Typed input is never cleared on any error path.
//
// UX contract (founder-reported bugs):
//  - a field's error clears the moment that field changes; we re-validate on
//    submit only (no nagging as you type);
//  - on invalid submit: a summary line under the button + scroll/focus the
//    first invalid field;
//  - while submitting: disabled button with a spinner + "Reserving…";
//  - success: the form is replaced by a visible panel, scrolled into view;
//  - duplicate / rate-limit / server error: a banner under the button.

// Same anonymous per-browser id the products_opened beacon uses, so M6's
// numerator (registered) and denominator (opened) share a distinct_id.
function visitorId(): string | undefined {
  try {
    return localStorage.getItem("vaira.visitor_id") ?? undefined;
  } catch {
    return undefined;
  }
}

const PHONE_RE = /^(?:\+?91)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIERS = new Set(["standard", "luxury", "haute"]);
const PHONE_MSG = "Enter a 10-digit Indian mobile starting with 6–9, or an email address.";

type FieldKey = "name" | "email" | "phone" | "city" | "product" | "tier" | "consent";
type Errors = Partial<Record<FieldKey, string>>;
const FOCUS_ORDER: FieldKey[] = ["name", "email", "phone", "city", "product", "tier", "consent"];

export function Waitlist({ presetProduct }: { presetProduct?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [product, setProduct] = useState(presetProduct ?? "");
  const [tier, setTier] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);

  const [errors, setErrors] = useState<Errors>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "duplicate">("idle");
  const successRef = useRef<HTMLDivElement>(null);

  // Bring the confirmation into view when it appears.
  useEffect(() => {
    if (status === "success" || status === "duplicate") {
      successRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      successRef.current?.focus();
    }
  }, [status]);

  // Clear a field's error(s) as the user edits it (re-validate on submit only).
  // email/phone share the cross-field "email or phone required" error, so editing
  // either contact field clears both, so a corrected field never keeps a stale error.
  function clearErr(...keys: FieldKey[]) {
    setErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const k of keys) if (next[k]) { next[k] = undefined; changed = true; }
      return changed ? next : prev;
    });
    if (summary) setSummary(null);
  }

  function validate(): Errors {
    const e: Errors = {};
    const n = name.trim();
    if (n.length < 2) e.name = "Please tell us your name (2+ characters).";
    else if (n.length > 80) e.name = "That name is too long (80 max).";

    const em = email.trim();
    const ph = phone.trim();
    if (em && !EMAIL_RE.test(em)) e.email = "That email doesn’t look right.";
    if (ph && !PHONE_RE.test(ph)) e.phone = PHONE_MSG;
    if (!em && !ph) e.email = "Enter an email or phone so we can reach you.";

    if (!product) e.product = "Choose a piece.";
    if (!tier || !TIERS.has(tier)) e.tier = "Choose a tier.";
    if (!consent) e.consent = "Please tick the box so we may contact you.";
    return e;
  }

  function focusFirst(e: Errors) {
    const k = FOCUS_ORDER.find((key) => e[key]);
    if (!k) return;
    const el = document.getElementById(`wl-${k}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement).focus({ preventScroll: true });
    }
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setBanner(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setSummary("Please fix the highlighted fields.");
      focusFirst(e);
      return;
    }
    setSummary(null);

    setStatus("submitting");
    const em = email.trim();
    const ph = phone.trim();
    const payload = {
      name: name.trim(),
      ...(em ? { email: em } : {}),
      ...(ph ? { phone: ph } : {}),
      city: city.trim() || undefined,
      product,
      tier,
      consent: true,
      source: presetProduct ? `products:${presetProduct}` : "products",
      ...(visitorId() ? { visitor_id: visitorId() } : {}),
    };

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json: { ok?: boolean; duplicate?: boolean; error?: string; errors?: Record<string, string[]> } = {};
      try { json = await res.json(); } catch { /* empty body */ }

      if (res.ok && json.ok) {
        setStatus(json.duplicate ? "duplicate" : "success");
        return;
      }
      if (res.status === 400 && json.errors) {
        const fe: Errors = {};
        const j = json.errors;
        if (j.name?.[0]) fe.name = j.name[0];
        // route reports contact problems under email / phone / _body
        if (j.email?.[0] || j._body?.[0]) fe.email = "Enter an email or phone so we can reach you.";
        if (j.phone?.[0]) fe.phone = PHONE_MSG;
        if (j.city?.[0]) fe.city = j.city[0];
        if (j.product?.[0]) fe.product = j.product[0];
        if (j.tier?.[0]) fe.tier = j.tier[0];
        if (j.consent?.[0]) fe.consent = j.consent[0];
        const finalErrs = Object.keys(fe).length ? fe : { email: "Please check your details and try again." };
        setErrors(finalErrs);
        setSummary("Please fix the highlighted fields.");
        focusFirst(finalErrs);
        setStatus("idle");
        return;
      }
      if (res.status === 429) {
        setBanner("Too many attempts just now. Please try again in a little while.");
      } else {
        setBanner("Something went wrong on our side. Your details are safe. Please try again.");
      }
      setStatus("idle");
    } catch {
      setBanner("We couldn’t reach the server. Check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "success" || status === "duplicate") {
    const dup = status === "duplicate";
    return (
      <div className="v-wl">
        <div className="v-success" role="status" aria-live="polite" ref={successRef} tabIndex={-1}>
          <div className="v-tick" aria-hidden>✓</div>
          <h3>{dup ? "You’re already on the list." : "You’re on the list."}</h3>
          <p>
            {dup
              ? "We already have your details, no need to join twice. We’ll hold your launch price and be in touch the moment the waitlist opens."
              : "We’ll hold your launch price and be the first to tell you the moment the waitlist opens at launch."}
          </p>
        </div>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <div className="v-wl">
      <form className="v-wl__card v-form" onSubmit={onSubmit} noValidate>
        {banner && <div className="v-banner v-banner--err" role="alert">{banner}</div>}

        <div className="v-field">
          <label htmlFor="wl-name">Full name <span className="v-req">*</span></label>
          <input
            id="wl-name" name="name" type="text" autoComplete="name" placeholder="Priya Sharma"
            value={name} onChange={(e) => { setName(e.target.value); clearErr("name"); }}
            aria-invalid={!!errors.name} aria-describedby={errors.name ? "wl-name-err" : undefined}
          />
          {errors.name && <span className="v-err" id="wl-name-err">{errors.name}</span>}
        </div>

        <div className="v-row2">
          <div className="v-field">
            <label htmlFor="wl-email">Email <span className="v-req">*</span></label>
            <input
              id="wl-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="priya@email.com"
              value={email} onChange={(e) => { setEmail(e.target.value); clearErr("email", "phone"); }}
              aria-invalid={!!errors.email} aria-describedby={errors.email ? "wl-email-err" : undefined}
            />
            {errors.email && <span className="v-err" id="wl-email-err">{errors.email}</span>}
          </div>
          <div className="v-field">
            <label htmlFor="wl-phone">Phone</label>
            <input
              id="wl-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210"
              value={phone} onChange={(e) => { setPhone(e.target.value); clearErr("phone", "email"); }}
              aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "wl-phone-err" : undefined}
            />
            {errors.phone && <span className="v-err" id="wl-phone-err">{errors.phone}</span>}
          </div>
        </div>

        <div className="v-row2">
          <div className="v-field">
            <label htmlFor="wl-city">City</label>
            <input
              id="wl-city" name="city" type="text" autoComplete="address-level2" placeholder="Mumbai"
              value={city} onChange={(e) => { setCity(e.target.value); clearErr("city"); }}
              aria-invalid={!!errors.city} aria-describedby={errors.city ? "wl-city-err" : undefined}
            />
            {errors.city && <span className="v-err" id="wl-city-err">{errors.city}</span>}
          </div>
          <div className="v-field">
            <label htmlFor="wl-product">Product <span className="v-req">*</span></label>
            <select
              id="wl-product" name="product" value={product} onChange={(e) => { setProduct(e.target.value); clearErr("product"); }}
              aria-invalid={!!errors.product} aria-describedby={errors.product ? "wl-product-err" : undefined}
            >
              <option value="" disabled>Choose a piece</option>
              {PRODUCTS.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
            {errors.product && <span className="v-err" id="wl-product-err">{errors.product}</span>}
          </div>
        </div>

        <div className="v-field">
          <label htmlFor="wl-tier">Tier <span className="v-req">*</span></label>
          <select
            id="wl-tier" name="tier" value={tier} onChange={(e) => { setTier(e.target.value); clearErr("tier"); }}
            aria-invalid={!!errors.tier} aria-describedby={errors.tier ? "wl-tier-err" : undefined}
          >
            <option value="" disabled>Choose a tier</option>
            <option value="standard">Standard</option>
            <option value="luxury">Luxury</option>
            <option value="haute">Haute (price on request)</option>
          </select>
          {errors.tier && <span className="v-err" id="wl-tier-err">{errors.tier}</span>}
        </div>

        <div className="v-field">
          <label htmlFor="wl-message">Message / questions</label>
          <textarea
            id="wl-message" name="message" placeholder="Any questions, gifting enquiries, or bulk orders…"
            value={message} onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <label className="v-consent">
          <input
            id="wl-consent" type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); clearErr("consent"); }}
            aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "wl-consent-err" : undefined}
          />
          <span>By joining, you agree we may contact you about the launch. Nothing else.</span>
        </label>
        {errors.consent && <span className="v-err" id="wl-consent-err">{errors.consent}</span>}

        <button type="submit" className="v-btn v-btn--primary v-btn--block" disabled={submitting} aria-busy={submitting}>
          {submitting ? (<><span className="v-spin" aria-hidden />Reserving…</>) : (<>Submit interest →</>)}
        </button>
        {summary && <p className="v-formsummary" role="alert">{summary}</p>}

        <p className="v-lock">
          <span aria-hidden>🔒</span> Your information is private and never shared with third parties.
        </p>
      </form>
    </div>
  );
}
