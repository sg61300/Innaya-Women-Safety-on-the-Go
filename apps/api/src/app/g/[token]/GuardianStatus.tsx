// Presentational guardian status view. Server-rendered, no client component:
// a small inline script drives the live "updated Ns ago" ticker, and the
// 3 s / 10 s poll stays on <meta http-equiv="refresh">. Reused by the real
// page (DB-backed) and the dev-only fixture route.

export type GuardianData = {
  name: string;
  phone: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  state: string; // latest protocol state
  archived: boolean;
  live: boolean; // frames + live ticker allowed
  loc: { lat: number; lng: number; ts: string } | null;
  battery: number | null; // 0..1
  lastContactTs: string | null;
  frames: { url: string; ts: string }[];
  frameError?: boolean;
  history: { state: string; changedAt: string }[];
  mapEmbedSrc: string | null;
  mapLink: string | null;
};

const STATE_COLOUR: Record<string, string> = {
  SAFE: "#3FA37C",
  AMBER: "#F2C94C",
  EMERGENCY: "#E76F51",
  CRITICAL: "#C1121F",
};
const ARCHIVED_COLOUR = "#6B667A";
const IST = "Asia/Kolkata";

function ago(ts: string | number | Date | null | undefined): string {
  if (!ts) return "";
  const d = Math.max(0, Date.now() - new Date(ts).getTime());
  const min = Math.floor(d / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
function hhmm(ts: string | number | Date): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: IST });
}
function dayLabel(ts: string | number | Date): string {
  const d = new Date(ts);
  const key = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: IST });
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (key(d) === key(today)) return "Today";
  if (key(d) === key(yest)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: IST });
}

// One 20px line icon per state (no icon dependency).
function StateIcon({ state, archived }: { state: string; archived: boolean }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (archived) return (<svg {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>);
  if (state === "SAFE") return (<svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></svg>);
  if (state === "AMBER") return (<svg {...p}><path d="M12 3l9 16H3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></svg>);
  if (state === "CRITICAL") return (<svg {...p}><path d="M6 16a6 6 0 0 1 12 0z" /><path d="M12 4v3" /><path d="M4 20h16" /><path d="M4.5 9l1.5 1" /><path d="M19.5 9L18 10" /></svg>);
  if (state === "EMERGENCY") return (<svg {...p}><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>);
  return (<svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2 2" /></svg>);
}

function stripCopy(d: GuardianData) {
  if (d.archived)
    return { label: "Archived", note: `No live signal${d.lastContactTs ? ` since ${hhmm(d.lastContactTs)}, ${dayLabel(d.lastContactTs).toLowerCase()}` : ""}. Her last location and evidence are kept.` };
  switch (d.state) {
    case "SAFE": return { label: "Safe", note: "On her way. All calm." };
    case "AMBER": return { label: "Amber", note: "Something needs a check. Keep this page open." };
    case "EMERGENCY": return { label: "Emergency", note: "An alarm is active. Live frames below." };
    case "CRITICAL": return { label: "Critical", note: "A critical alarm is active. Call her now." };
    default: return { label: d.state.replace(/_/g, " "), note: "Monitoring her journey." };
  }
}

export function GuardianStatus({ data }: { data: GuardianData }) {
  const d = data;
  const colour = d.archived ? ARCHIVED_COLOUR : STATE_COLOUR[d.state] ?? ARCHIVED_COLOUR;
  const darkText = !d.archived && d.state === "AMBER";
  const initial = (d.name.match(/[A-Za-zÀ-ɏ]/)?.[0] ?? "V").toUpperCase();
  const { label, note } = stripCopy(d);
  const refreshSecs = d.live ? 3 : 10;
  // Frontend fallback: the fixture and some deployments have coordinates but no
  // prebuilt Embed API URL. Reuse the existing Google Maps destination so the
  // page can still render a map without changing the backend contract.
  const mapSrc = d.mapEmbedSrc ?? (d.loc ? `https://www.google.com/maps?q=${d.loc.lat},${d.loc.lng}&z=16&output=embed` : null);

  // Group timeline rows by IST day, newest first (data already sorted desc).
  const groups: { day: string; rows: GuardianData["history"] }[] = [];
  for (const row of d.history) {
    const day = dayLabel(row.changedAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.rows.push(row);
    else groups.push({ day, rows: [row] });
  }

  return (
    <main className="g-shell" data-state={d.archived ? "ARCHIVED" : d.state} data-live={d.live ? "1" : "0"}>
      <meta httpEquiv="refresh" content={String(refreshSecs)} />
      <title>{`INNAYA · ${d.name}`}</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap" />
      <GuardianStyle />

      <header className="g-hero">
        <div className="g-hero__bar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="g-hero__emblem" src="/brand/emblem.webp" alt="" aria-hidden />
          <span className="g-hero__word">INNAYA</span>
          <span className="g-hero__tag">Guardian view</span>
        </div>
        <div className="g-hero__id">
          <span className="g-avatar" aria-hidden>{initial}</span>
          <div className="g-hero__who">
            <h1 className="g-hero__name">{d.name}</h1>
            {(d.fromLabel || d.toLabel) && (
              <p className="g-hero__route">
                <span>{d.fromLabel || "Start"}</span>
                <span className="g-hero__arrow" aria-hidden> → </span>
                <span>{d.toLabel || "Destination"}</span>
              </p>
            )}
          </div>
        </div>
      </header>

      <section
        className={`g-strip${darkText ? " g-strip--dark" : ""}${d.live ? " is-live" : ""}`}
        style={{ background: colour }}
        role="status"
        data-testid={d.archived ? "archived-banner" : "state-banner"}
        data-state={d.archived ? "ARCHIVED" : d.state}
      >
        <span className="g-strip__ic"><StateIcon state={d.state} archived={d.archived} /></span>
        <span className="g-strip__text">
          <span className="g-strip__label">{label}</span>
          <span className="g-strip__note">{note}</span>
        </span>
        {d.live && <span className="g-strip__ticker" data-ago={Date.now()}>updated just now</span>}
      </section>

      <div className="g-wrap">
        <section className="g-summary" aria-label="Journey summary">
          <div className="g-summary__lead"><span className="g-summary__eyebrow">Journey overview</span><strong>{d.state === "IDLE" ? "No active journey" : `${label} journey`}</strong><span>{d.lastContactTs ? `Last contact ${ago(d.lastContactTs)}` : "Waiting for the first signal"}</span></div>
          <div className="g-summary__stats"><div><span>Battery</span><strong>{d.battery == null ? "—" : `${Math.round(d.battery * 100)}%`}</strong></div><div><span>Updates</span><strong>{d.live ? "Live" : "Paused"}</strong></div></div>
        </section>
        <section className="g-card g-map">
          <div className="g-section-head"><h2 className="g-h2">Last known location</h2>{d.mapLink && <a className="g-inline-link" href={d.mapLink} target="_blank" rel="noreferrer">Open full map</a>}</div>
          <div className="g-map__canvas">
            {mapSrc ? (
              <iframe className="g-map__frame" title="Last known location" src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            ) : (
              <span className="g-map__empty">{d.loc ? "Map preview unavailable" : "No location shared yet"}</span>
            )}
            {d.loc && <span className="g-map__chip">Last seen {ago(d.loc.ts)}</span>}
          </div>
          {d.loc && <p className="g-map__caption">Location is approximate and updates when her phone sends a new signal.</p>}
        </section>

        <section className="g-card g-live" data-testid="live-panel">
          <h2 className="g-h2">Live feed</h2>
          {d.live ? (
            d.frames.length ? (
              <div className="g-live__grid">
                {d.frames.slice(0, 4).map((f, i) => (
                  <figure key={i} className="g-live__tile">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={`Masked camera frame ${i + 1}`} />
                    <figcaption className="g-live__chip">{ago(f.ts)}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="g-empty-note" data-testid={d.frameError ? "live-unavailable" : "live-waiting"}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
                <span>{d.frameError ? "The latest masked frame is temporarily unavailable. Please refresh shortly." : "Waiting for the next masked frame."}</span>
              </div>
            )
          ) : (
            <div className="g-empty-note" data-testid="live-gated">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 9V7a5 5 0 0 0-10 0" /><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M12 14v2" /></svg>
              <span>Live feed appears only in an emergency. Her camera stays private until then.</span>
            </div>
          )}
        </section>

        <section className="g-card g-timeline">
          <h2 className="g-h2">Timeline</h2>
          {groups.length ? (
            <div className="g-rail">
              {groups.map((g, gi) => (
                <div key={gi} className="g-rail__group">
                  <div className="g-rail__day">{g.day}</div>
                  <ol className="g-rail__list">
                    {g.rows.map((row, ri) => (
                      <li key={ri} className="g-row">
                        <span className="g-row__dot" style={{ background: STATE_COLOUR[row.state] ?? ARCHIVED_COLOUR }} aria-hidden />
                        <span className="g-row__main">
                          <span className="g-row__state">{row.state.replace(/_/g, " ")}</span>
                          <span className="g-row__rel">{ago(row.changedAt)}</span>
                        </span>
                        <span className="g-row__abs">{hhmm(row.changedAt)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          ) : (
            <p className="g-empty-note"><span>No state changes yet.</span></p>
          )}
        </section>

        {/* Desktop: three buttons in a row (hidden on mobile). */}
        <section className="g-actions">
          {d.phone && <a className="g-btn g-btn--primary" href={`tel:${d.phone}`}>Call {d.name}</a>}
          <a className="g-btn g-btn--danger" href="tel:112">Call 112</a>
          {d.mapLink && <a className="g-btn g-btn--ghost" href={d.mapLink} target="_blank" rel="noreferrer">Open in Maps</a>}
        </section>

        <p className="g-misuse">Shared with you to help her. Please do not forward this link. <a href="mailto:abuse@example.com">Report misuse</a></p>
        <a className="g-disclaimer-trigger" href="#g-disclaimer-dialog">Privacy &amp; legal notice</a>
      </div>

      <div id="g-disclaimer-dialog" className="g-disclaimer" role="dialog" aria-modal="true" aria-labelledby="g-disclaimer-title">
        <div className="g-disclaimer__panel">
          <div className="g-disclaimer__head">
            <div>
              <span className="g-disclaimer__eyebrow">Please read</span>
              <h2 id="g-disclaimer-title">Privacy &amp; legal notice</h2>
            </div>
            <a className="g-disclaimer__close" href="#" aria-label="Close privacy and legal notice">×</a>
          </div>
          <p>This page gives you limited access to private safety information only to help protect {d.name} during this journey.</p>
          <ul>
            <li>Do not copy, download, photograph, screenshot, record, forward, publish, or share this page or any information shown here.</li>
            <li>Use the information only for the immediate safety purpose for which it was shared. Do not use it for any other purpose or disclose it to anyone else.</li>
            <li>Keep this link and all information on it confidential. If you receive it by mistake, close it and report the issue.</li>
            <li>Unauthorised access, use, copying, or disclosure may harm the user and may make you legally responsible under applicable law.</li>
          </ul>
          <p className="g-disclaimer__fine">By continuing to use this page, you acknowledge these restrictions and agree to protect the user’s privacy.</p>
          <a className="g-btn g-btn--primary g-disclaimer__done" href="#">I understand</a>
        </div>
      </div>

      {/* Mobile: sticky action bar with the map link above the call buttons. */}
      <div className="g-sticky">
        {d.mapLink && <a className="g-sticky__link" href={d.mapLink} target="_blank" rel="noreferrer">Open in Maps</a>}
        <div className="g-sticky__row">
          {d.phone && <a className="g-btn g-btn--primary" href={`tel:${d.phone}`}>Call {d.name}</a>}
          <a className="g-btn g-btn--danger" href="tel:112">Call 112</a>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html:
            "(function(){function f(m){var s=Math.max(0,Math.round((Date.now()-m)/1000));if(s<60)return 'updated '+s+'s ago';var n=Math.floor(s/60);if(n<60)return 'updated '+n+'m ago';return 'updated '+Math.floor(n/60)+'h ago';}function t(){document.querySelectorAll('[data-ago]').forEach(function(e){e.textContent=f(+e.getAttribute('data-ago'));});}t();setInterval(t,1000);})();",
        }}
      />
    </main>
  );
}

export function LinkExpired() {
  return (
    <main className="g-shell">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap" />
      <GuardianStyle />
      <header className="g-hero">
        <div className="g-hero__bar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="g-hero__emblem" src="/brand/emblem.webp" alt="" aria-hidden />
          <span className="g-hero__word">INNAYA</span>
          <span className="g-hero__tag">Guardian view</span>
        </div>
      </header>
      <div className="g-wrap">
        <section className="g-card g-empty">
          <h1 className="g-empty__title">Link expired</h1>
          <p className="g-empty__body">This safety link is no longer active. Ask her to share a new one from the INNAYA app.</p>
        </section>
        <p className="g-misuse">Shared with you to help her. Please do not forward this link. <a href="mailto:abuse@example.com">Report misuse</a></p>
      </div>
    </main>
  );
}

// Guardian theme. Light and outdoor-readable by default; the whole scheme flips
// to the products-site dark tokens under prefers-color-scheme: dark. The hero
// band and state colours stay constant across both. Scoped to .g-shell so it
// never touches the dark products site.
function GuardianStyle() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
.g-shell{
  --ink:#1F1B2E;--muted:#6B667A;--ground:#FBF7F2;--card:#FFFFFF;--line:#ECE4D8;
  --plum:#241019;--plum-2:#180D14;--rose:#C98E7A;--rose-line:rgba(201,160,99,0.28);
  --champagne:#C9A063;--champ-lite:#E6C79A;--ivory:#F3ECE4;
  --brand-a:#F250A6;--brand-b:#A85BD8;--brand-c:#E7B65C;--radius:16px;
  --sans:"Plus Jakarta Sans","Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  --serif:"Playfair Display","Cormorant Garamond","Georgia",serif;
  margin:0;min-height:100vh;background:var(--ground);color:var(--ink);font-family:var(--sans);line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
.g-shell *{box-sizing:border-box;}
.g-shell a{color:inherit;}

/* hero */
.g-hero{background:radial-gradient(120% 220px at 50% -30px,rgba(120,40,80,0.5),transparent 62%),linear-gradient(180deg,var(--plum) 0%,var(--plum-2) 100%);
  border-bottom:1px solid var(--rose-line);color:var(--ivory);padding:14px 18px 22px;}
.g-hero__bar{display:flex;align-items:center;gap:10px;max-width:680px;margin:0 auto;}
.g-hero__emblem{height:30px;width:30px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(240,80,166,0.4));}
.g-hero__word{font-family:var(--serif);font-weight:800;letter-spacing:.14em;font-size:20px;
  background:linear-gradient(100deg,var(--brand-a),var(--brand-b) 46%,var(--brand-c));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;}
.g-hero__tag{margin-left:auto;font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--champ-lite);}
.g-hero__id{display:flex;align-items:center;gap:14px;max-width:680px;margin:16px auto 0;}
.g-avatar{flex:0 0 auto;width:56px;height:56px;border-radius:999px;display:grid;place-items:center;
  font-family:var(--serif);font-weight:700;font-size:26px;color:#2A130A;
  background:linear-gradient(135deg,var(--champ-lite),var(--rose));box-shadow:0 6px 16px rgba(0,0,0,0.35),inset 0 0 0 1px rgba(255,255,255,0.25);}
.g-hero__who{min-width:0;}
.g-hero__name{margin:0;font-family:var(--serif);font-weight:700;font-size:30px;line-height:1.05;letter-spacing:-0.01em;}
.g-hero__route{margin:6px 0 0;font-size:14px;color:#D9CBD3;display:flex;flex-wrap:wrap;align-items:center;gap:2px;}
.g-hero__arrow{color:var(--champ-lite);font-weight:700;}

/* state strip */
.g-strip{display:flex;align-items:center;gap:13px;padding:14px 18px;color:#fff;}
.g-strip--dark{color:#3A2A05;}
.g-strip__ic{flex:0 0 auto;display:grid;place-items:center;width:38px;height:38px;border-radius:999px;background:rgba(255,255,255,0.2);}
.g-strip--dark .g-strip__ic{background:rgba(58,42,5,0.14);}
.g-strip__text{display:flex;flex-direction:column;min-width:0;}
.g-strip__label{font-weight:800;font-size:18px;letter-spacing:.01em;line-height:1.1;}
.g-strip__note{font-size:13.5px;opacity:.95;}
.g-strip__ticker{margin-left:auto;flex:0 0 auto;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  padding:5px 10px;border-radius:999px;background:rgba(255,255,255,0.22);white-space:nowrap;}
.g-strip.is-live{animation:g-pulse 2.4s ease-in-out infinite;}
@keyframes g-pulse{0%,100%{box-shadow:0 0 0 0 rgba(0,0,0,0);filter:brightness(1);}50%{box-shadow:0 0 0 6px rgba(255,255,255,0.12);filter:brightness(1.08);}}

/* layout */
.g-wrap{max-width:960px;margin:0 auto;padding:24px 20px 40px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:16px;}
.g-card,.g-summary{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:20px;box-shadow:0 8px 24px rgba(31,27,46,0.06);min-width:0;}
.g-summary{grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;gap:20px;background:linear-gradient(135deg,#fff 0%,#fffaf5 56%,#f7ecf1 100%);}
.g-summary__lead{display:flex;flex-direction:column;gap:3px;min-width:0}.g-summary__lead strong{font-family:var(--serif);font-size:25px;line-height:1.1}.g-summary__lead span:last-child{color:var(--muted);font-size:13px}.g-summary__eyebrow{color:var(--brand-b);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.g-summary__stats{display:flex;gap:10px;flex:0 0 auto}.g-summary__stats div{min-width:78px;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.7)}.g-summary__stats span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.1em}.g-summary__stats strong{display:block;margin-top:3px;font-size:16px}.g-section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:12px}.g-section-head .g-h2{margin:0}.g-inline-link{font-size:12px;font-weight:700;color:var(--brand-b);white-space:nowrap;text-decoration:underline;text-underline-offset:3px}
.g-h2{margin:0 0 12px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700;}

/* map */
.g-map__canvas{position:relative;border:1px solid var(--line);border-radius:14px;overflow:hidden;min-height:260px;
  background:linear-gradient(115deg,#efe7dc 25%,#f6f0e7 37%,#efe7dc 50%);background-size:280% 100%;animation:g-shimmer 2.2s linear infinite;}
.g-map__frame{position:relative;z-index:1;width:100%;height:320px;border:0;display:block;background:#e9e4df;}
.g-map__empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:14px;text-align:center;padding:0 24px;z-index:1;}
.g-map__chip{position:absolute;left:12px;bottom:12px;z-index:2;font-size:12px;font-weight:600;color:var(--ink);
  background:rgba(255,255,255,0.92);border:1px solid var(--line);border-radius:999px;padding:6px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.14);}
.g-map__caption{margin:10px 2px 0;color:var(--muted);font-size:12px;}
@keyframes g-shimmer{to{background-position:-280% 0;}}

/* live feed */
.g-live__grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.g-live__tile{position:relative;margin:0;aspect-ratio:4/3;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#eee;}
.g-live__tile img{width:100%;height:100%;object-fit:cover;display:block;}
.g-live__chip{position:absolute;left:8px;bottom:8px;font-size:11px;font-weight:600;color:#fff;background:rgba(20,12,18,0.66);border-radius:999px;padding:3px 9px;}
.g-empty-note{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14px;padding:6px 2px;}
.g-empty-note svg{flex:0 0 auto;color:var(--rose);}

/* timeline rail */
.g-rail{display:flex;flex-direction:column;gap:6px;}
.g-rail__day{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:10px 0 2px;}
.g-rail__group:first-child .g-rail__day{margin-top:0;}
.g-rail__list{list-style:none;margin:0;padding:0;position:relative;}
.g-rail__list::before{content:"";position:absolute;left:5px;top:14px;bottom:14px;width:2px;background:var(--line);}
.g-row{position:relative;display:flex;align-items:baseline;gap:12px;padding:9px 0 9px 22px;}
.g-row__dot{position:absolute;left:0;top:12px;width:12px;height:12px;border-radius:999px;box-shadow:0 0 0 3px var(--card);}
.g-row__main{display:flex;flex-direction:column;min-width:0;flex:1;}
.g-row__state{font-weight:700;font-size:15px;}
.g-row__rel{font-size:12.5px;color:var(--muted);}
.g-row__abs{flex:0 0 auto;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;}

/* buttons */
.g-btn{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:999px;font-weight:700;font-size:16px;text-decoration:none;border:1.5px solid transparent;padding:0 22px;white-space:nowrap;}
.g-btn--primary{background:linear-gradient(135deg,var(--brand-a),var(--brand-b));color:#fff;box-shadow:0 6px 18px rgba(168,91,216,0.3);}
.g-btn--danger{background:#C1121F;color:#fff;box-shadow:0 6px 18px rgba(193,18,31,0.26);}
.g-btn--ghost{background:var(--card);border-color:#D8CFBF;color:var(--ink);}
.g-actions{display:none;gap:12px;}
.g-timeline{grid-column:1 / -1;}

/* mobile sticky bar */
.g-sticky{position:fixed;left:0;right:0;bottom:0;z-index:50;display:flex;flex-direction:column;gap:8px;
  padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:rgba(251,247,242,0.94);backdrop-filter:blur(10px);border-top:1px solid var(--line);}
.g-sticky__link{text-align:center;font-size:13px;font-weight:600;color:var(--muted);text-decoration:underline;}
.g-sticky__row{display:flex;gap:10px;}
.g-sticky__row .g-btn{flex:1;}

/* misuse footer, small caps like the site motto */
.g-misuse{margin:14px 2px 116px;font-size:11px;letter-spacing:.08em;color:var(--muted);text-align:center;line-height:1.6;text-transform:uppercase;}
.g-misuse a{color:var(--muted);text-decoration:underline;letter-spacing:.02em;}
.g-disclaimer-trigger{display:block;margin:0 auto 6px;color:var(--muted);font-size:12px;text-decoration:underline;text-underline-offset:3px;padding:8px 12px;}
.g-disclaimer{display:none;position:fixed;inset:0;z-index:100;place-items:center;width:100%;height:100%;padding:12px;background:rgba(18,10,16,.62);backdrop-filter:blur(3px);}
.g-disclaimer:target{display:grid;}
.g-disclaimer__panel{width:min(560px,100%);max-height:calc(100vh - 24px);overflow:auto;border:1px solid var(--line);border-radius:22px;padding:22px;background:var(--card);color:var(--ink);box-shadow:0 24px 80px rgba(20,10,18,.28);}
.g-disclaimer__head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.g-disclaimer__eyebrow{display:block;color:var(--brand-b);font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.g-disclaimer h2{margin:4px 0 0;font-family:var(--serif);font-size:27px;line-height:1.1}.g-disclaimer p{font-size:14px;line-height:1.55;color:var(--muted)}.g-disclaimer ul{margin:14px 0;padding-left:20px;color:var(--ink)}.g-disclaimer li{padding:4px 0;font-size:13.5px;line-height:1.45}.g-disclaimer__fine{font-size:12px!important}.g-disclaimer__close{color:var(--muted);font-size:28px;line-height:1;text-decoration:none;padding:0 2px}.g-disclaimer__done{width:100%;margin-top:6px;}

/* link-expired card */
.g-empty{text-align:center;padding:30px 22px;}
.g-empty__title{margin:0 0 8px;font-family:var(--serif);font-size:26px;font-weight:700;}
.g-empty__body{margin:0;color:var(--muted);font-size:15px;}

/* desktop */
@media (min-width:640px){
  .g-hero{padding:16px 24px 26px;}
  .g-hero__name{font-size:34px;}
  .g-actions{display:flex;}
  .g-actions .g-btn{flex:1;}
  .g-sticky{display:none;}
  .g-misuse{margin-bottom:14px;}
}

@media (max-width:1024px){
  .g-hero{padding:14px 16px 22px}.g-hero__tag{font-size:9px;letter-spacing:.14em}.g-hero__id{margin-top:22px;gap:12px}.g-hero__name{font-size:32px}.g-hero__route{font-size:13px;line-height:1.45}.g-avatar{width:54px;height:54px}
  .g-strip{padding:14px 16px;align-items:flex-start}.g-strip__ticker{margin-top:2px;font-size:9px;padding:5px 7px}.g-strip__label{font-size:17px}.g-strip__note{font-size:12.5px;line-height:1.35;overflow-wrap:anywhere}
  .g-wrap{display:flex;flex-direction:column;width:auto;max-width:none;padding:16px 12px calc(32px + 116px);gap:12px}.g-wrap>*{width:100%;box-sizing:border-box}.g-card,.g-summary{border-radius:18px;padding:16px}.g-summary{display:block}.g-summary__stats{margin-top:14px}.g-summary__stats div{flex:1}.g-map__canvas,.g-map__frame{min-height:250px;height:250px}.g-live__grid{grid-template-columns:1fr 1fr;gap:8px}.g-h2{font-size:11px}.g-row{gap:8px;padding-left:20px}.g-row__state{font-size:14px}.g-row__abs{font-size:12px}.g-misuse{margin-bottom:0}.g-section-head{align-items:flex-start}.g-inline-link{font-size:11px}
}
@media (max-width:350px){
  .g-hero__tag{display:none}.g-hero__name{font-size:29px}.g-strip__ticker{white-space:normal;text-align:center;max-width:62px}.g-summary__lead strong{font-size:22px}.g-live__grid{grid-template-columns:1fr}.g-sticky{padding-left:10px;padding-right:10px}.g-btn{padding:0 12px;font-size:14px}
  .g-disclaimer__panel{padding:18px}.g-disclaimer h2{font-size:24px}
}

/* dark scheme: products-site dark tokens */
@media (prefers-color-scheme:dark){
  .g-shell{--ground:#0B0A0C;--card:#170F14;--line:#392A33;--ink:#F3ECE4;--muted:#B7ABB6;}
  .g-map__canvas{background:linear-gradient(115deg,#1a1016 25%,#241019 37%,#1a1016 50%);background-size:280% 100%;}
  .g-map__chip{background:rgba(23,15,20,0.9);color:var(--ivory);border-color:var(--line);}
  .g-live__tile{background:#241019;}
  .g-btn--ghost{background:var(--card);border-color:var(--line);color:var(--ivory);}
  .g-sticky{background:rgba(11,10,12,0.94);border-top-color:var(--line);}
}

@media (prefers-reduced-motion:reduce){
  .g-strip.is-live{animation:none;}
  .g-map__canvas{animation:none;}
}
`,
      }}
    />
  );
}
