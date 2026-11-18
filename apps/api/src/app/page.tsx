import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Spectral, Work_Sans } from "next/font/google";
import "./home.css";
import { WaitlistCampaign } from "./_home/WaitlistCampaign";
import { CampaignMotion } from "./_home/CampaignMotion";
import { Phone } from "./_home/Phone";

// INNAYA campaign landing page — route "/". Art direction "The light that walks
// her home" (s26 redesign): one rose-gold light recurs in every section, a plum
// dark act (hero, journey, the people who worry) then a warm cream act (what is
// coming in real product photography, and the founder's why). Announcement tone:
// an app is coming, get an early invite. Single CTA: join the waitlist (email
// mandatory). Copy is verbatim from vault Marketing/landing-page-copy.md.
// REVEAL rule: this page may state the promise / who it is for / why now / how it
// feels / jewellery-outside-only / the founder's why. It must NEVER mention
// scoring, masking, cancel or vote mechanics, timers, hardware internals, prices,
// or provider/model names.

// Fonts self-hosted at build via next/font (display: swap) — Spectral (display)
// + Work Sans (body), matching comp A. Exposed as CSS variables on .vhome.
const spectral = Spectral({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "swap",
});
const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-work",
  display: "swap",
});

const SITE = process.env.APP_BASE_URL ?? "https://innaya.example.com";
const TITLE = "INNAYA. Move freely. We've got you.";
const DESC =
  "An app is coming: hands-free safety for women who travel alone. Help reaches the people you trust before you ever reach for your phone. Join the waitlist for an early invite.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE}/` },
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: `${SITE}/`,
    siteName: "INNAYA",
    type: "website",
    images: [{ url: `${SITE}/og-cover.png`, width: 1200, height: 630, alt: "INNAYA. Move freely. We've got you. An app is coming." }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [`${SITE}/og-cover.png`],
  },
};

// Founder's why — verbatim from Marketing/landing-page-copy.md § Founder's why
// (APPROVED 2026-09-26; per brief: render it, mark nothing on page).
const FOUNDER_WHY =
  "Every few weeks there is another story about a woman who was just going home, to work, to a class, and did not get there safely. I stopped being able to read them as news. I am building INNAYA because a woman should be able to walk out of her door, get on a bus, take a late cab, and think about her day, not about who is behind her. Safety should not mean carrying fear, or a gadget, or having someone on the phone the whole way. It should be quiet, always there, and hers. That is what we are making. If you have ever texted ‘reached’ to someone who was waiting up, this is for you and for them.";

const FAQ: { q: string; a: string }[] = [
  {
    q: "When is INNAYA launching?",
    a: "Soon, in India. Join the waitlist and you'll be among the first to know. Tester invites go out every week, oldest sign-ups first.",
  },
  {
    q: "What does it cost to join the waitlist?",
    a: "Nothing. The waitlist is free, and testers try INNAYA on their everyday journeys at no cost.",
  },
  {
    q: "Is this only an app?",
    a: "The app comes first. Discreet jewellery is coming later. Join the waitlist for the first look.",
  },
  {
    q: "Can my college or workplace take part?",
    a: "Yes. Organisations can reserve free tester spots for students and staff before launch. Join the waitlist and mention your organisation.",
  },
];

// Inline lucide-style line icons for the app tab bar (real icons, not placeholders).

// Desktop layout (>= 1024px): the "ab1" combination is the default (founder
// 2026-10-12) — a left copy rail + a centred visual zone for the hero and journey,
// every text section centred at a comfortable reading width, inside a fluid content
// box that never goes edge-to-edge. Below 1024px is unchanged. See home.css.
export default function HomePage() {
  return (
    <div className={`vhome ${spectral.variable} ${workSans.variable}`}>
      <a className="sr-only" href="#waitlist">Skip to the waitlist form</a>

      <nav id="nav">
        <div className="nav-inner">
          <a className="brand" href="#top" aria-label="INNAYA, back to top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="wm-emblem" src="/campaign/emblem-rosegold-alpha-256.png" alt="" width={28} height={28} aria-hidden />
            <span className="wm">INNAYA</span>
          </a>
          <a className="nav-cta" href="#waitlist">Get an early invite</a>
        </div>
      </nav>

      {/* HERO — the promise, the waitlist, and the INNAYA emblem as the brand object.
          data-hero toggles the two arrangements evaluated for lane C2 (emblem as
          the object vs. emblem beside the headline with the phone kept). */}
      <header className="hero dark" id="top">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Coming soon in India</p>
            <h1 className="disp-hero">Move freely.<em>We&apos;ve got you.</em></h1>
            <p className="lede">
              Hands-free safety for women who travel alone. Help reaches the people you trust
              before you ever reach for your phone.
            </p>
            <div className="wl" id="waitlist">
              <WaitlistCampaign />
            </div>
          </div>

          <div className="hero-object">
            {/* the emblem as the brand object on the Slate Petrol ground. It reads
                "a woman, moving freely, protected" — the hero promise made visual.
                The live app leads the very next section, so the hero loses no app
                narrative (arrangement chosen over keeping the phone here, s28 C2). */}
            <div className="hero-emblem" role="img" aria-label="The INNAYA emblem: a woman, protected.">
              {/* The rose-gold logo walk with NO background (s33c, founder: "just have
                  logo woman and stars ... without the box background"). The mp4 is
                  "stacked alpha": top = colour, then a black gap, bottom = transparency mask, so
                  one ordinary H.264 file works on every browser incl. iPhone (no VP9/HEVC
                  alpha needed). CampaignMotion draws it onto the canvas with WebGL, only
                  while on screen. The still (first frame, transparent) shows before the
                  first frame is drawn, and is all that shows with reduced motion, no JS
                  or no WebGL (the video src is then never set, so it never downloads). */}
              <div className="logo-stack">
                <img className="logo-still" src="/campaign/logo-walk-still.webp" width={640} height={640} alt="" />
                <canvas className="logo-canvas" data-logo-canvas width={640} height={640} aria-hidden />
                <video
                  className="logo-src"
                  data-logo-src="/campaign/logo-walk-stacked.mp4"
                  muted
                  loop
                  playsInline
                  preload="none"
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* CHAPTER 01 — the journey, as a short phone film (s33). A pre-rendered 3D film
          (public/campaign/innaya-film-s33.mp4) turns the phone through five real app
          screens: Home (auto-scrolls to Plan my journey), the journey form, the safety
          check-in, help being called, and the guardian's phone receiving the alert.
          Plays on view, pauses off view (CampaignMotion data-play-on-view). Reduced
          motion / no-JS: the poster plus the five-step caption list, and the mp4 is never
          downloaded. The five caption lines live ONLY here (one-place change). */}
      <section className="sec dark film-sec" aria-label="How it feels to be looked after, a short film">
        <div className="wrap film-wrap">
          <div className="film-head">
            <span className="chapno" aria-hidden>01</span>
            <p className="eyebrow">One journey</p>
            <h2 className="sec-title">How it feels to be <em>looked after.</em></h2>
          </div>
          <div className="film-stage">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              id="campaign-film"
              className="film-video"
              muted
              playsInline
              preload="none"
              poster="/campaign/innaya-film-s33-poster.webp"
              data-play-on-view
              data-src="/campaign/innaya-film-s33.mp4"
              aria-label="A short film of the INNAYA app through one journey: the home screen, planning a journey, a safety check-in, help being called, and the guardian's phone receiving the alert with the location."
            />
          </div>
          {/* The five headlines, the single source for both the film captions and the
              no-JS / reduced-motion step list. CampaignMotion adds .film-synced and shows
              one at a time, in step with the film. */}
          <ol className="film-caps">
            <li className="film-cap on"><span className="num" aria-hidden>01 / 05</span><h3>Start your journey, never alone</h3></li>
            <li className="film-cap"><span className="num" aria-hidden>02 / 05</span><h3>It stays beside you until you arrive</h3></li>
            <li className="film-cap"><span className="num" aria-hidden>03 / 05</span><h3>If something changes, it checks on you</h3></li>
            <li className="film-cap"><span className="num" aria-hidden>04 / 05</span><h3>If you can&apos;t answer, or in an emergency, it acts for you</h3></li>
            <li className="film-cap"><span className="num" aria-hidden>05 / 05</span><h3>The people you chose know at once</h3></li>
          </ol>
          {/* No-JS: expand the reserved single-caption slot to the full readable 5-step list
              (the film is poster-only without JS). JS-on users never see this style. */}
          <noscript>
            <style>{".vhome .film-caps{position:static;width:auto;min-height:0}.vhome .film-cap{position:static;opacity:1;transform:none;transition:none;margin:0 0 12px}"}</style>
          </noscript>
          {/* Replay button (founder round 2, reusing the s31 preview look/behaviour). Hidden
              until the film ends, then CampaignMotion shows it; a click restarts the film and
              the caption sync from 0. Keyboard-reachable only while shown (visibility toggles
              it out of the tab order when hidden). Reduced motion: shows "Play" from the start; the film downloads only on tap (s33e). */}
          <button className="film-replay" id="film-replay" type="button">Replay</button>
        </div>
      </section>

      {/* CHAPTER 02 — the people who worry, joined by the light */}
      <section className="sec dark people" aria-label="For the people who worry">
        <div className="wrap">
          {/* s33d: heading + paragraph as ONE left rail beside the carousel on wide screens */}
          <div className="people-rail">
            <div className="sec-head">
              <span className="chapno" aria-hidden>02</span>
              <p className="eyebrow">For the people who worry</p>
              <h2 className="sec-title">The ones who wait up <em>can rest now.</em></h2>
            </div>
            {/* s33d founder: paragraph "on left side of section 2 where carousel is present" (laptop) and
                "Above the carousel" (phones), white serif at body size. */}
            <p className="people-body reveal d1">No more waiting for the &ldquo;reached home&rdquo; text. The people she trusts are reached straight away if she needs them. No app to learn, just a simple way to know she&apos;s okay. If you love someone who travels alone, this is for you too.</p>
          </div>
          {/* CYLINDER CAROUSEL (s32, founder 2026-10-12). The two phones sit on a cylinder:
              her phone front, the guardian view behind. .people-pin is the pin track (both
              laptop and mobile, with JS motion): the section HOLDS while the first downward
              scroll turns the back phone to the front (her -> guardian). After that the
              visitor turns the cylinder themselves with a horizontal mouse swipe/drag,
              the arrow keys, a trackpad/wheel, or a touch swipe. Driven in CampaignMotion
              (--rot). No-JS / reduced motion flattens it to both phones in flow (home.css). */}
          <div className="people-pin">
            <div className="people-stage reveal">
              <div className="glow" aria-hidden />
              <div className="phones" id="peopleCyl" role="group" aria-roledescription="carousel"
                   aria-label="Her phone and the guardian view. Scroll, swipe, or use the arrow keys to turn from one to the other.">
                <div className="pcyl-slot" data-ph="her">
                  <Phone id="phone-her" only={0} label="Her INNAYA home screen: on standby, one guardian watching, ready to set off." />
                </div>
                <svg className="thread" viewBox="0 0 420 200" preserveAspectRatio="none" aria-hidden>
                  <path d="M0 100 C 120 40, 300 160, 420 100" pathLength={1} />
                </svg>
                <div className="pcyl-slot" data-ph="guardian">
                  <Phone id="phone-guardian" view="guardian" label="The guardian view: Aarohi is on her way home, live, safe." />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* seam: the light carries us into the warm act */}
      <div className="seam to-warm" aria-hidden><div className="glow" /></div>

      {/* CHAPTER 03 — the warm act, in real photography */}
      <section id="jewel" className="sec warm later" aria-label="What is coming">
        <div className="wrap">
          <div className="sec-head">
            <span className="chapno" aria-hidden>03</span>
            <p className="eyebrow">And later</p>
            <h2 className="sec-title">It won&apos;t look like <em>a safety gadget.</em></h2>
          </div>
          {/* Founder-approved swipe (s31 v3): the three pieces on a native scroll-snap
              strip, one in front in true colour, neighbours turned and receding, soft
              faded sides. Driven by scroll (swipe / trackpad / drag / arrow keys),
              enhanced in CampaignMotion; reduced-motion flattens it (home.css). */}
          <div className="jewel-strip" id="jewelStrip" tabIndex={0} role="region" aria-roledescription="gallery"
               aria-label="INNAYA pieces in satin rose-gold, each with a small blue stone. Swipe or use the arrow keys to see each one.">
            <div className="jewel-track">
              <div className="jewel-slide"><div className="jewel-piece" style={{ "--maskimg": "url(/campaign/jewellery/locket-pebble-3d.webp)" } as CSSProperties}>
                <div className="floor" aria-hidden />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/campaign/jewellery/locket-pebble-3d.webp" alt="A small rounded-rectangle INNAYA locket on a fine chain, with a blue stone." width={680} height={760} loading="lazy" />
                <div className="sheen" aria-hidden /></div></div>
              <div className="jewel-slide"><div className="jewel-piece" style={{ "--maskimg": "url(/campaign/jewellery/locket-halo-oval-3d.webp)" } as CSSProperties}>
                <div className="floor" aria-hidden />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/campaign/jewellery/locket-halo-oval-3d.webp" alt="The oval INNAYA locket on a fine chain, a blue stone set in a ring of fine slots." width={680} height={760} loading="lazy" />
                <div className="sheen" aria-hidden /></div></div>
              <div className="jewel-slide"><div className="jewel-piece" style={{ "--maskimg": "url(/campaign/jewellery/pin-teardrop-3d.webp)" } as CSSProperties}>
                <div className="floor" aria-hidden />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/campaign/jewellery/pin-teardrop-3d.webp" alt="A teardrop INNAYA brooch with a blue stone." width={680} height={760} loading="lazy" />
                <div className="sheen" aria-hidden /></div></div>
            </div>
          </div>
          <p className="lede jewel-line reveal d1">Discreet jewellery is coming: a locket, a brooch, a kada, a patch. Beautiful enough to wear every day, quietly looking after you. Nothing anyone else would notice. Join the waitlist for the first look.</p>
          <div className="jewel-worn reveal d1">
            <figure>
              {/* Kada video (founder OK 2026-10-12; placed s33c "Replace the kada still"). Original
                  pixels (founder s33c chose the original over a cream-lifted version that haloed
                  the arm edge); only colour tags added. Plays only while on screen (CampaignMotion); reduced
                  motion keeps the poster (first frame) and never downloads the video. */}
              <video
                data-play-on-view
                data-src="/campaign/jewellery/kada-wrist.mp4"
                poster="/campaign/jewellery/kada-wrist-poster.webp"
                width={640}
                height={640}
                muted
                loop
                playsInline
                preload="none"
                aria-label="The INNAYA kada worn on a wrist: a smooth rose-gold cuff with a small blue stone, sitting like everyday jewellery."
              />
            </figure>
            <div className="jewel-copy">
              <div className="rule-dot" aria-hidden />
              <h3>Worn every day.</h3>
              <p>No one would know it is looking after you. That is the point.</p>
              <ul className="jewel-forms">
                <li><span className="d" aria-hidden>01</span><span>Locket, brooch, kada or patch</span></li>
                <li><span className="d" aria-hidden>02</span><span>Help called on its own</span></li>
                <li><span className="d" aria-hidden>03</span><span>Your people told straight away</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* founder's why — on cream, framed by the light */}
      <section className="sec warm why" aria-label="Why we are building INNAYA">
        <div className="wrap">
          <blockquote className="fq reveal">
            <div className="rule-dot" />
            <p>{FOUNDER_WHY}</p>
            <div className="rule-dot b" />
            <cite>Founder, INNAYA</cite>
          </blockquote>
        </div>
      </section>

      <section className="sec dark" aria-label="Good to know">
        <div className="wrap">
          <div className="sec-head" style={{ maxWidth: 820 }}>
            <p className="eyebrow">Before you ask</p>
            <h2 className="sec-title">Good to know.</h2>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q} name="faq">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <p className="fine">Hands-free travel safety, made for women in India. Coming soon.</p>
            <a className="nav-cta" href="#waitlist">Be first to know</a>
          </div>
          <div className="foot-emblem" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/campaign/emblem-rosegold-alpha-1024.png" alt="" width={120} height={120} />
          </div>
          <div className="foot-wm" aria-hidden>INNAY<span>A</span></div>
        </div>
      </footer>

      <CampaignMotion />
    </div>
  );
}
