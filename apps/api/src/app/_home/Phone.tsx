// Real app screenshots inside the CSS device frame. One component, three uses:
// the pinned app stage (#phone-stage: the four journey panes scrubbed by the
// stage's scroll progress), a carousel card (one pane, `only`) and the guardian
// band (a single guardian-view pane). The frame + bezel live once in home.css.
//
// Beats 01-03 are real captures of the live app (home, check-in, "Help is being
// called"); each fills its pane via object-fit cover. Beat 04 "Reached safely"
// has no honest real capture (the Plan-a-journey screen ANRs on the capture
// emulator, lane S3), so it keeps the designed mock. The guardian view also keeps
// its mock until a real guardian-portal capture lands (lane S4). Each pane keeps
// its data-pane id and the .on toggle so the stage scrub (CampaignMotion) and
// lane C2's single-index proof are untouched.

import type { CSSProperties } from "react";

type Shot = { src: string; alt: string };
const DIR = "/campaign/screens";
// 1x pane width 280, 2x 560 (home-/check-in-/people-told-*.webp, q82).
const IMG_W = 280;
const IMG_H = 581;
const SHOTS: Record<number, Shot> = {
  0: { src: "home", alt: "INNAYA home screen: standby with one guardian watching, and a button to plan your journey." },
  1: { src: "check-in", alt: "INNAYA check-in screen asking “Are you safe? Say your safe word.” with a countdown." },
  2: { src: "people-told", alt: "INNAYA alert screen reading “Help is being called.”: guardians notified, location shared, nearby app users alerted, live feed on, siren on." },
};

// Exploded-screen regions (effect A). ONE data map, keyed by screenshot src, so the
// deep-plum captures that will replace these webps only need their band % updated
// here. Each region is a horizontal band of the screen (t% from top, b% from bottom)
// that is drawn as a second clipped copy of the SAME screenshot and lifted toward the
// viewer (translateY + scale + soft shadow, driven by --x) so the real UI regions
// (home: header / status ring / Call-Video row / journey card / tab bar; check-in:
// ring / title / buttons; alert: title / checklist / cancel) float off the flat base
// copy that stays on the phone. z = how far forward that band lifts (0..1).
type Band = { t: number; b: number; z: number };
const REGIONS: Record<string, Band[]> = {
  home: [
    { t: 0, b: 83, z: 0.85 }, // greeting header
    { t: 20, b: 55, z: 0.6 }, // status ring
    { t: 46, b: 41, z: 1 }, // Call / Video row
    { t: 59, b: 11, z: 0.72 }, // journey card
    { t: 90, b: 0, z: 0.5 }, // SOS tab bar
  ],
  "check-in": [
    { t: 26, b: 52, z: 0.72 }, // countdown ring
    { t: 48, b: 39, z: 0.5 }, // "Are you safe?" title
    { t: 62, b: 17, z: 1 }, // safe / danger buttons
  ],
  "people-told": [
    { t: 3, b: 79, z: 0.7 }, // "Help is being called." + siren line
    { t: 24, b: 52, z: 0.9 }, // the checklist
    { t: 83, b: 3, z: 1 }, // "I'm safe — cancel" button
  ],
};

// The lifted band copies for one screenshot. Decorative duplicates of the base
// screen-img (aria-hidden); at rest (--x 0) each overlays the base exactly, so the
// screen reads as one flat capture until the scroll driver raises --x.
function lifts(src: string) {
  const regs = REGIONS[src];
  if (!regs) return null;
  return (
    <span className="lifts" aria-hidden>
      {regs.map((r, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          className="lift"
          src={`${DIR}/${src}-1x.webp`}
          srcSet={`${DIR}/${src}-1x.webp 1x, ${DIR}/${src}-2x.webp 2x`}
          width={IMG_W}
          height={IMG_H}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          style={{ clipPath: `inset(${r.t}% 0 ${r.b}% 0)`, ["--z" as string]: r.z } as CSSProperties}
        />
      ))}
    </span>
  );
}

// The four journey panes as a data-indexed renderer so the stage (all four,
// scrubbed) and a carousel card (one pane, `only`) share one source of truth.
function journeyPane(i: number, on: boolean, eager = false) {
  const cls = `pane${on ? " on" : ""}`;
  const shot = SHOTS[i];
  if (shot) {
    return (
      <div className={cls} data-pane={String(i)} key={i}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="screen-img"
          src={`${DIR}/${shot.src}-1x.webp`}
          srcSet={`${DIR}/${shot.src}-1x.webp 1x, ${DIR}/${shot.src}-2x.webp 2x`}
          width={IMG_W}
          height={IMG_H}
          alt={shot.alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
        />
        {lifts(shot.src)}
      </div>
    );
  }
  // Beat 04 — designed "Reached safely" mock (no honest real capture exists).
  return (
    <div className={cls} data-pane="3" key="3">
      <div className="pe lift" style={{ ["--z" as string]: 0.5 } as CSSProperties}>Journey complete</div>
      <div className="psafe lift" style={{ ["--z" as string]: 0.9 } as CSSProperties}>
        <div className="ring"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 12l5 5L20 6" pathLength={1} /></svg></div>
        <div className="st">Reached safely.</div>
        <div className="pm" style={{ fontSize: 12 }}>Your people have been told.</div>
      </div>
    </div>
  );
}

const journeyPanes = (
  <>
    {journeyPane(0, true, true)}
    {journeyPane(1, false, true)}
    {journeyPane(2, false, true)}
    {journeyPane(3, false)}
  </>
);

// Guardian pane — a faithful miniature of the REAL guardian page
// (g/[token]/GuardianStatus.tsx). Every line is provable copy from that page for a
// SAFE journey: the status strip ("Safe" / "On her way. All calm.", stripCopy),
// the journey overview (route + "Last contact just now" + Battery/Updates stats),
// "Last known location" with a "Last seen just now" chip, and the gated live-feed
// note. No invented feature. Fills the frame so there is no dead white space.
const gStat = { flex: 1, border: "1px solid var(--p-line)", borderRadius: 10, padding: "7px 9px", background: "rgba(255,255,255,.05)" } as const;
const gStatLabel = { display: "block", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--p-muted)" } as const;
const gStatVal = { display: "block", marginTop: 2, fontSize: 13, fontWeight: 600, color: "var(--p-ink)" } as const;
const guardianPane = (
  <div className="pane on" data-pane="g">
    <div className="pe">Guardian view · Mom</div>
    <div className="pt">Aarohi is on her<br />way home.</div>
    <div className="pguard lift" style={{ ["--z" as string]: 0.6 } as CSSProperties}>
      <div className="av" />
      <div><div className="tn">Safe</div><div className="ts">On her way. All calm.</div></div>
    </div>
    <div className="pcard lift" style={{ marginTop: 10, ["--z" as string]: 0.85 } as CSSProperties}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--p-ink)" }}>
        Home <span style={{ color: "var(--p-rose)" }} aria-hidden>&rarr;</span> Indiranagar
      </div>
      <div className="pm" style={{ marginTop: 4 }}>Last contact just now</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div style={gStat}><span style={gStatLabel}>Battery</span><span style={gStatVal}>82%</span></div>
        <div style={gStat}><span style={gStatLabel}>Updates</span><span style={gStatVal}>Live</span></div>
      </div>
    </div>
    <div className="pcard lift" style={{ marginTop: 10, ["--z" as string]: 1 } as CSSProperties}>
      <div style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--p-muted)", fontWeight: 600 }}>Last known location</div>
      <div style={{ marginTop: 8, height: 50, borderRadius: 10, border: "1px solid var(--p-line)", background: "linear-gradient(115deg,#2a2040,#342849 60%,#2a2040)", position: "relative", overflow: "hidden" }}>
        <span style={{ position: "absolute", left: 8, bottom: 6, fontSize: 10, fontWeight: 600, color: "var(--p-ink)", background: "rgba(18,12,24,.82)", borderRadius: 999, padding: "2px 8px" }}>Last seen just now</span>
      </div>
    </div>
    <div className="pm" style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11, lineHeight: 1.35 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--p-rose)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", marginTop: 1 }} aria-hidden>
        <path d="M17 9V7a5 5 0 0 0-10 0" /><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M12 14v2" />
      </svg>
      <span>Her camera stays private until an emergency.</span>
    </div>
  </div>
);

export function Phone({
  id,
  view = "journey",
  label,
  only,
}: {
  id: string;
  view?: "journey" | "guardian";
  label: string;
  only?: number; // render a single journey pane (carousel card / people band); default renders all four
}) {
  const panes = view === "guardian" ? guardianPane : typeof only === "number" ? journeyPane(only, true, true) : journeyPanes;
  return (
    <div className="phone" id={id} role="img" aria-label={label}>
      <div className="screen">{panes}</div>
    </div>
  );
}
