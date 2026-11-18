"use client";

import { useEffect, useRef, useState } from "react";

// Campaign waitlist form (single CTA, founder ruling 2026-09-24). Collects only
// email (required) + city (optional) + one consent checkbox, and posts to the
// shared POST /api/waitlist with source:"campaign". The route enforces email
// server-side, de-dupes on email, and sends the confirmation email. Inline
// success state replaces the form; a duplicate is a friendly "already on the list".

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function visitorId(): string | undefined {
  try {
    return localStorage.getItem("vaira.visitor_id") ?? undefined;
  } catch {
    return undefined;
  }
}

export function WaitlistCampaign() {
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [consent, setConsent] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [consentErr, setConsentErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "duplicate">("idle");
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "success" || status === "duplicate") {
      doneRef.current?.focus();
    }
  }, [status]);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setBanner(null);
    const em = email.trim();
    let bad = false;
    if (!em || !EMAIL_RE.test(em)) { setEmailErr("Please enter a valid email so we can send your invite."); bad = true; }
    else setEmailErr(null);
    if (!consent) { setConsentErr("Please tick the box so we can email you."); bad = true; }
    else setConsentErr(null);
    if (bad) return;

    setStatus("submitting");
    const payload = {
      email: em,
      ...(city.trim() ? { city: city.trim() } : {}),
      consent: true,
      source: "campaign",
      ...(visitorId() ? { visitor_id: visitorId() } : {}),
    };
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let json: { ok?: boolean; duplicate?: boolean; error?: string; errors?: Record<string, string[]> } = {};
      try { json = await res.json(); } catch { /* empty */ }

      if (res.ok && json.ok) {
        setStatus(json.duplicate ? "duplicate" : "success");
        return;
      }
      if (res.status === 400 && json.errors?.email) {
        setEmailErr("Please enter a valid email so we can send your invite.");
        setStatus("idle");
        return;
      }
      if (res.status === 429) setBanner("Too many attempts just now. Please try again in a little while.");
      else setBanner("Something went wrong on our side. Your email is safe. Please try again.");
      setStatus("idle");
    } catch {
      setBanner("We couldn't reach the server. Check your connection and try again.");
      setStatus("idle");
    }
  }

  if (status === "success" || status === "duplicate") {
    const dup = status === "duplicate";
    return (
      <div className="success" role="status" aria-live="polite" ref={doneRef} tabIndex={-1}>
        <div className="tick" aria-hidden>&#10003;</div>
        <h2>{dup ? "You're already on the list." : "You're on the list."}</h2>
        <p>
          {dup
            ? "We already have your email, no need to join twice. We'll be in touch as tester invites go out."
            : "Thanks for joining. Check your inbox for a note from us, and we'll email your tester invite soon."}
        </p>
      </div>
    );
  }

  const submitting = status === "submitting";
  return (
    <form className="form-card" onSubmit={onSubmit} noValidate aria-labelledby="wl-title">
      <h2 id="wl-title">Be first to know.</h2>
      <p className="hint">An app is coming. Get an early invite when it opens.</p>
      {banner && <div className="banner" role="alert">{banner}</div>}

      <div className="field">
        <label htmlFor="wl-email">Email <span className="req" aria-hidden>*</span><span className="sr-only">(required)</span></label>
        <input
          id="wl-email" name="email" type="email" inputMode="email" autoComplete="email"
          placeholder="Where should we send your invite?" required
          value={email} onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(null); }}
          aria-invalid={!!emailErr} aria-describedby={emailErr ? "wl-email-err" : undefined}
        />
        {emailErr && <span className="err" id="wl-email-err">{emailErr}</span>}
      </div>

      <div className="field">
        <label htmlFor="wl-city">City <span style={{ color: "var(--ink-mut)", fontWeight: 500 }}>(optional)</span></label>
        <input
          id="wl-city" name="city" type="text" autoComplete="address-level2"
          placeholder="Delhi / Ghaziabad / Bengaluru / Other"
          value={city} onChange={(e) => setCity(e.target.value)}
        />
      </div>

      <label className="consent" htmlFor="wl-consent">
        <input
          id="wl-consent" type="checkbox" checked={consent}
          onChange={(e) => { setConsent(e.target.checked); if (consentErr) setConsentErr(null); }}
          aria-invalid={!!consentErr} aria-describedby={consentErr ? "wl-consent-err" : undefined}
        />
        <span>Send me the tester invite.</span>
      </label>
      {consentErr && <span className="err" id="wl-consent-err">{consentErr}</span>}

      <button type="submit" className="btn" disabled={submitting} aria-busy={submitting}>
        {submitting ? (<><span className="spin" aria-hidden />Joining&#8230;</>) : "Join the waitlist"}
      </button>
      <p className="finep">We'll only email you about INNAYA. Nothing else.</p>
    </form>
  );
}
