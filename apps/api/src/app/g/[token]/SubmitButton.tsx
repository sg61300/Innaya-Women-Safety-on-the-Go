"use client";
import { useEffect, useState } from "react";

// INNAYA guardian vote button. It is server-rendered inside a plain <form method="post">, so it
// STILL posts with JavaScript turned off (progressive enhancement). With JS on, the first tap
// disables the button, greys it and swaps the label to "Sending…", AND paints a full-screen
// centre loader showing the walking INNAYA logo, then lets the native POST carry on — a slow
// (cold-start) submit no longer looks frozen, and a second tap is impossible. onSubmit never
// calls preventDefault, so this is still a native form post, not fetch. With JS off there is no
// overlay; the guardian just sees the native submit. The Safe button also greys itself at the
// 35-min cancel deadline on a page left open (`closed`/`until`); the server refuses a late Safe
// either way — and no loader shows after the deadline (sending never flips once `over`).
// The approved INNAYA logo walk (the same 81-frame walk the campaign hero plays, from
// public/campaign/logo-walk-stacked.mp4), made small: transparent, every 2nd frame (41 frames,
// 8 fps, same ~5 s cycle), 48 px frames in one strip (1968x48 WebP, ~41 KB), shown at 96 px in
// the centre overlay (the 48 px art upscaled 2x) and stepped by CSS. A <link rel="preload">
// (React hoists it to <head>) is in the server HTML, so the strip is already cached when the
// guardian taps and the loader paints instantly. Reduced motion: no animation, the first frame
// (her walking profile) stays still. The overlay sits on the campaign dark-plum ground (#17111F)
// so the rose-gold walk reads clearly, centred on the screen.
const WALK = "/guardian/logo-walk-strip.webp";
const WALK_FRAMES = 41;
const WALK_PX = 96; // centre-overlay frame size (orchestrator reading 2026-11-17: rose-gold walk ~96 px, centred)
const WALK_CSS =
  `@keyframes innaya-walk{to{background-position-x:-${WALK_FRAMES * WALK_PX}px}}` +
  `.innaya-walk{animation:innaya-walk ${(WALK_FRAMES * 0.125).toFixed(3)}s steps(${WALK_FRAMES}) infinite}` +
  `@media (prefers-reduced-motion:reduce){.innaya-walk{animation:none}}`;

// Full-screen centre loader. One is rendered only by the SubmitButton that is sending (the other
// stays idle), so a single overlay covers the page. position:fixed is viewport-relative (no
// transformed ancestor on the guardian page), so it centres regardless of scroll.
function CentreLoader() {
  return (
    <div
      role="status"
      aria-label="Sending"
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#17111F", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <span
        className="innaya-walk"
        style={{ display: "block", width: WALK_PX, height: WALK_PX, backgroundImage: `url(${WALK})`, backgroundRepeat: "no-repeat", backgroundSize: `${WALK_FRAMES * WALK_PX}px ${WALK_PX}px`, backgroundPositionX: 0 }}
      />
      <style>{WALK_CSS}</style>
    </div>
  );
}

export function SubmitButton({
  action,
  value,
  label,
  background,
  closed = false,
  until,
}: {
  action: string;
  value: "true" | "false";
  label: string;
  background: string;
  closed?: boolean; // past the group's window + 5 min: Safe starts greyed (server decision)
  until?: number; // that moment, so a page left open greys Safe without a refresh
}) {
  const [over, setOver] = useState(closed);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (over || !until) return;
    const t = setTimeout(() => setOver(true), Math.max(0, until - Date.now()));
    return () => clearTimeout(t);
  }, [over, until]);
  const busy = over || sending;
  return (
    <form
      method="post"
      action={action}
      onSubmit={() => {
        if (!over) setSending(true); // native POST still fires; no preventDefault
      }}
      style={{ flex: 1, minWidth: 140 }}
    >
      <link rel="preload" as="image" href={WALK} fetchPriority="low" />
      <input type="hidden" name="safe" value={value} />
      <button
        type="submit"
        disabled={busy}
        aria-busy={sending}
        style={{ width: "100%", padding: "14px", font: "700 16px system-ui", color: "#fff", background: busy ? "#9ca3af" : background, border: 0, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        {sending ? "Sending…" : label}
      </button>
      {sending && <CentreLoader />}
    </form>
  );
}
