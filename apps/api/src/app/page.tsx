import type { Metadata } from "next";
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/campaign/emblem-rosegold-alpha-1024.png" alt="" width={380} height={380} aria-hidden />
            </div>
          </div>
        </div>
      </header>

      {/* CHAPTER 01 — the journey, pinned and scrubbed */}
      <section className="sec dark seq app-seq" aria-label="How it feels to be looked after">
        <div className="seq-pin">
          <div className="wrap stage-grid">
            <div className="stage-copy">
              <span className="chapno" aria-hidden>01</span>
              <p className="eyebrow">One journey</p>
              <h2 className="sec-title">How it feels to be <em>looked after.</em></h2>
              {/* desktop (>= 981px): a persistent four-step list, the active step lit */}
              <ol className="beats" aria-label="One journey, four steps">
                <li className="beat" data-beat="0" aria-current="step"><span className="n">01</span><h3>You start your journey.</h3><p>Open the app, tell it where you&apos;re going. That&apos;s it.</p></li>
                <li className="beat" data-beat="1"><span className="n">02</span><h3>It looks after you.</h3><p>If something feels wrong, help is called on its own. You don&apos;t have to do anything.</p></li>
                <li className="beat" data-beat="2"><span className="n">03</span><h3>Your people are told.</h3><p>The ones you trust see you&apos;re safe, or that you need them, straight away. And there&apos;s a loud siren if it&apos;s needed.</p></li>
                <li className="beat" data-beat="3"><span className="n">04</span><h3>Reached safely.</h3><p>Your people have been told.</p></li>
              </ol>
            </div>
            <div className="stage-object">
              <Phone id="phone-stage" label="The INNAYA app through one journey: where you are headed, being looked after on the way, your people told, reached safely." />
              <div className="seq-counter" aria-hidden><span className="cur">01</span> / 04</div>
            </div>
          </div>

          {/* phone (<= 980px): a self-advancing snap carousel, one card per beat,
              each card carrying its own phone pane. Autoplay stops on any touch. */}
          <div className="wrap beats-mobile">
            <ol className="beats-carousel pre" aria-label="One journey, four steps">
              <li className="vcard" data-beat="0">
                <div className="vcard-copy"><span className="n">01</span><h3>You start your journey.</h3><p>Open the app, tell it where you&apos;re going. That&apos;s it.</p></div>
                <div className="vcard-phone"><Phone id="cphone-0" only={0} label="Start your journey: tell the app where you are headed." /></div>
              </li>
              <li className="vcard" data-beat="1">
                <div className="vcard-copy"><span className="n">02</span><h3>It looks after you.</h3><p>If something feels wrong, help is called on its own. You don&apos;t have to do anything.</p></div>
                <div className="vcard-phone"><Phone id="cphone-1" only={1} label="On your way: INNAYA is looking after you." /></div>
              </li>
              <li className="vcard" data-beat="2">
                <div className="vcard-copy"><span className="n">03</span><h3>Your people are told.</h3><p>The ones you trust see you&apos;re safe, or that you need them, straight away. And there&apos;s a loud siren if it&apos;s needed.</p></div>
                <div className="vcard-phone"><Phone id="cphone-2" only={2} label="Your people are told: the ones you trust are notified." /></div>
              </li>
              <li className="vcard" data-beat="3">
                <div className="vcard-copy"><span className="n">04</span><h3>Reached safely.</h3><p>Your people have been told.</p></div>
                <div className="vcard-phone"><Phone id="cphone-3" only={3} label="Reached safely: your people have been told." /></div>
              </li>
            </ol>
            <div className="carousel-dots" role="tablist" aria-label="Journey step">
              <button className="cdot" type="button" aria-selected="true" aria-label="Step 1"><span className="fill" aria-hidden /></button>
              <button className="cdot" type="button" aria-selected="false" aria-label="Step 2"><span className="fill" aria-hidden /></button>
              <button className="cdot" type="button" aria-selected="false" aria-label="Step 3"><span className="fill" aria-hidden /></button>
              <button className="cdot" type="button" aria-selected="false" aria-label="Step 4"><span className="fill" aria-hidden /></button>
            </div>
          </div>
        </div>
      </section>

      {/* CHAPTER 02 — the people who worry, joined by the light */}
      <section className="sec dark people" aria-label="For the people who worry">
        <div className="wrap">
          <div className="sec-head">
            <span className="chapno" aria-hidden>02</span>
            <p className="eyebrow">For the people who worry</p>
            <h2 className="sec-title">The ones who wait up <em>can rest now.</em></h2>
          </div>
          <div className="people-stage reveal">
            <div className="glow" aria-hidden />
            <div className="phones">
              <Phone id="phone-her" label="Her INNAYA app: on her way home, live and safe." />
              <svg className="thread" viewBox="0 0 420 200" preserveAspectRatio="none" aria-hidden>
                <path d="M0 100 C 120 40, 300 160, 420 100" pathLength={1} />
              </svg>
              <Phone id="phone-guardian" view="guardian" sos={false} label="The guardian view: Rhea is on her way home, live, safe." />
            </div>
          </div>
          <p className="people-body reveal d1">No more waiting for the &ldquo;reached home&rdquo; text. The people she trusts are reached straight away if she needs them. No app to learn, just a simple way to know she&apos;s okay. If you love someone who travels alone, this is for you too.</p>
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
          <div className="jewel-hero reveal">
            <div className="glow" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/campaign/jewellery/locket-halo-oval.webp" alt="The INNAYA locket in satin rose-gold: an oval pendant on a fine chain, with a small blue stone at its centre." width={1254} height={1254} loading="lazy" />
          </div>
          <p className="lede jewel-line reveal d1">Discreet jewellery is coming: a locket, a brooch, a kada, a patch. Beautiful enough to wear every day, quietly looking after you. Nothing anyone else would notice. Join the waitlist for the first look.</p>
          <div className="jewel-worn reveal d1">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/campaign/jewellery/kada-wrist.webp" alt="The INNAYA kada worn on a wrist: a smooth rose-gold cuff with a small blue stone, sitting like everyday jewellery." width={1254} height={1254} loading="lazy" />
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
