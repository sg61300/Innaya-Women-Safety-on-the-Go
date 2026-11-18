import type { ReactNode } from "react";

// The CSS phone mock, rendered as real server HTML. One component, three uses:
// the hero (journey panes cross-faded by hero scroll), the pinned app stage
// (the same journey panes scrubbed by the stage's scroll progress, --p) and the
// guardian band (a single guardian-view pane). Styles live once in home.css.
// The map route and the "reached" check are SVG paths with pathLength=1 so the
// stage can draw them with stroke-dashoffset from --p; with no --p they are
// fully drawn (hero, no-JS, reduced motion).

function TabIcon({ path }: { path: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {path}
    </svg>
  );
}

// The four journey panes as a data-indexed renderer so the stage (all four,
// scrubbed) and a carousel card (one pane, `only`) share one source of truth.
function journeyPane(i: number, on: boolean) {
  const cls = `pane${on ? " on" : ""}`;
  switch (i) {
    case 0:
      return (
        <div className={cls} data-pane="0" key="0">
          <div className="pe">Good evening, Aarohi</div>
          <div className="pt">Where are you<br />headed tonight?</div>
          <div className="pcard"><div className="pm">Home to Indiranagar</div><div className="ppill">Start your journey</div></div>
          <div className="pguard" style={{ marginTop: 14 }}><div className="av" /><div><div className="tn">2 guardians watching</div><div className="ts">Maa · Rhea</div></div></div>
        </div>
      );
    case 1:
      return (
        <div className={cls} data-pane="1" key="1">
          <div className="pe">On your way</div>
          <div className="pt">We&apos;re looking<br />after you.</div>
          <div className="pmap">
            <svg className="route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><path d="M22 76 C 22 46, 40 34, 58 30 S 80 22, 82 12" pathLength={1} /></svg>
            <div className="dot" />
          </div>
        </div>
      );
    case 2:
      return (
        <div className={cls} data-pane="2" key="2">
          <div className="pe">Your people are told</div>
          <div className="pt">Rhea has been<br />notified.</div>
          <div className="pguard"><div className="av" /><div><div className="tn">Rhea</div><div className="ts">Seeing your live journey ✓</div></div></div>
          <div className="pguard"><div className="av av2" /><div><div className="tn">Maa</div><div className="ts">Notified ✓</div></div></div>
        </div>
      );
    default:
      return (
        <div className={cls} data-pane="3" key="3">
          <div className="pe">Journey complete</div>
          <div className="psafe">
            <div className="ring"><svg viewBox="0 0 24 24" aria-hidden><path d="M4 12l5 5L20 6" pathLength={1} /></svg></div>
            <div className="st">Reached safely.</div>
            <div className="pm" style={{ fontSize: 12 }}>Your people have been told.</div>
          </div>
        </div>
      );
  }
}

const journeyPanes = (
  <>
    {journeyPane(0, true)}
    {journeyPane(1, false)}
    {journeyPane(2, false)}
    {journeyPane(3, false)}
  </>
);

const guardianPane = (
  <div className="pane on" data-pane="g">
    <div className="pe">Guardian view · Maa</div>
    <div className="pt">Rhea is on her<br />way home.</div>
    <div className="pcard"><div className="pm">Live, Home to Indiranagar</div></div>
    <div className="pguard"><div className="av" /><div><div className="tn">Safe ✓</div><div className="ts">Nothing to do. You&apos;ll be told if that changes.</div></div></div>
  </div>
);

// `sos` — the guardian's own phone has no SOS: nothing to do there, and no red in the calm section.
// `screen` — when a real captured app screenshot is supplied it fills the frame
// (object-fit cover) and the CSS-drawn panes/tab bar are the fallback only until
// those screenshots land (see brief step 7). No screenshot => the CSS panes render.
export function Phone({
  id,
  view = "journey",
  label,
  sos = true,
  screen,
  only,
}: {
  id: string;
  view?: "journey" | "guardian";
  label: string;
  sos?: boolean;
  screen?: string;
  only?: number; // render a single journey pane (carousel card); default renders all four
}) {
  const panes = view === "guardian" ? guardianPane : typeof only === "number" ? journeyPane(only, true) : journeyPanes;
  return (
    <div className="phone" id={id} role="img" aria-label={label}>
      <div className="screen">
        {screen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="screen-img" src={screen} alt="" aria-hidden />
        ) : (
          <>
            {panes}
            <div className="ptab" aria-hidden>
              <i><TabIcon path={<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>} /></i>
              <i><TabIcon path={<><path d="M20 10c0 6-8 11-8 11s-8-5-8-11a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>} /></i>
              {sos && <div className="sosbtn">SOS</div>}
              <i><TabIcon path={<><path d="M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6Z" /><path d="m9 12 2 2 4-4" /></>} /></i>
              <i><TabIcon path={<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></>} /></i>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
