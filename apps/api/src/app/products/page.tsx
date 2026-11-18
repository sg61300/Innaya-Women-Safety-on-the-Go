import Link from "next/link";
import { PRODUCTS } from "@/products/catalog";
import { CollectionCard } from "./_components/CollectionCard";
import { Waitlist } from "./_components/Waitlist";
import { PageOpenedBeacon } from "./_components/PageOpenedBeacon";

// Collection page (/products). Hero → feature strip → product grid → Why INNAYA
// → skin → gifting → waitlist. All copy is verbatim from Design/06 §§1–6; the
// feature strip uses only §3 claims (no "GPS", no dB; see Design/06 §7).

// Why INNAYA: six pillars, each icon + short label + one line (<=8 words).
// Claims drawn from Design/06 §3; no "GPS", no dB (§7).
const ic = (d: React.ReactNode) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{d}</svg>);
const WHY: { icon: React.ReactNode; h: string; p: string }[] = [
  { icon: ic(<path d="M13 2 4 13h7l-1 9 9-11h-7l1-9z" />), h: "Hands-free SOS", p: "Calls for help on its own." },
  { icon: ic(<><path d="M6 3h12l3 5-9 13L3 8z" /><path d="M3 8h18" /></>), h: "Looks like jewellery", p: "No one can tell it apart." },
  { icon: ic(<><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" /><path d="m9 12 2 2 4-4" /></>), h: "Calls her people first", p: "Guardians reached straight away, no app." },
  { icon: ic(<><circle cx="12" cy="12" r="9" /><path d="M4 12s3-5 8-5 8 5 8 5-3 5-8 5" /><path d="m5 5 14 14" /></>), h: "Faces stay hidden", p: "Others' faces hidden in what it sees." },
  { icon: ic(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>), h: "Cannot be silenced", p: "Two passwords and a guardian check." },
  { icon: ic(<><path d="M12 21s-7-5-7-11a7 7 0 0 1 14 0c0 6-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>), h: "Made for India", p: "Monsoon, sweat, sunscreen, long chains." },
];

// Icon + label + one-line sub. Claims are drawn only from Design/06 §3.
const FEATURES: { icon: React.ReactNode; h: string; p: string }[] = [
  {
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4 13h7l-1 9 9-11h-7l1-9z" /></svg>),
    h: "Hands-free help", p: "Calls for help on its own, no phone to unlock.",
  },
  {
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" /><path d="m9 12 2 2 4-4" /></svg>),
    h: "Guardians first", p: "Your people are reached straight away, no app.",
  },
  {
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>),
    h: "Can't be silenced", p: "Two passwords and a guardian check cancel an alarm.",
  },
  {
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12l3 5-9 13L3 8z" /><path d="M3 8h18M9 3 7.5 8 12 21M15 3l1.5 5L12 21" /></svg>),
    h: "Fine jewellery", p: "Looks like jewellery, no one can tell it apart.",
  },
];

export default async function CollectionPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  const preset = PRODUCTS.some((x) => x.slug === p) ? p : undefined;
  return (
    <main>
      {/* products_opened beacon (M6 denominator) */}
      <PageOpenedBeacon type="products_opened" />
      {/* HERO */}
      <section className="v-hero">
        <div className="v-hero__inner">
          <div className="v-hero__grid">
            <div className="v-hero__text">
              <span className="v-hero__badge">✦ Timeless jewellery. Built for safety.</span>
              <h1 className="v-hero__title">
                <span className="v-line v-line--gold">Move freely.</span>
                <span className="v-line v-line--white">We&apos;ve got you.</span>
              </h1>
              <p className="v-promise">
                A locket, brooch, kada or patch she loves to wear, ready to call for help before she reaches for a phone.
              </p>
              <div className="v-hero__cta">
                <Link href="#collection" className="v-btn v-btn--primary">Explore collection</Link>
                <Link href="#waitlist" className="v-btn v-btn--ghost">Express interest</Link>
              </div>
            </div>
            <div className="v-hero__lockup">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/lockup.webp" alt="INNAYA. Move freely. We've got you." />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE STRIP */}
      <div className="v-featstrip-wrap">
        <div className="v-wrap">
          <div className="v-featstrip">
            {FEATURES.map((f) => (
              <div className="v-feat" key={f.h}>
                <span className="v-feat__ic" aria-hidden>{f.icon}</span>
                <div>
                  <h3>{f.h}</h3>
                  <p>{f.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GRID */}
      <section className="v-section" id="collection">
        <div className="v-wrap">
          <span className="v-eyebrow">The pieces</span>
          <h2>Choose the piece she&apos;ll want to wear.</h2>
          <div className="v-grid">
            {PRODUCTS.map((prod) => (
              <CollectionCard key={prod.slug} product={prod} />
            ))}
          </div>
          <p className="v-foot-note">Start with one piece and add the patch or Eye button later: one cradle, one app, one subscription across everything. Kits from ₹8,499; guardian subscription ₹199/month. Launch pricing, may change before shipping.</p>
        </div>
      </section>

      {/* WHY */}
      <section className="v-section" id="why">
        <div className="v-wrap">
          <span className="v-eyebrow">Why INNAYA</span>
          <h2>Beautiful to wear. Serious about safety.</h2>
          <div className="v-why-split">
            <div className="v-why-img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/products/pendant/locket-slim-angled-rose-gold.webp" alt="INNAYA Locket Slim pendant, rose-gold finish" loading="lazy" />
            </div>
            <div className="v-why">
              {WHY.map((f) => (
                <div className="v-why__item" key={f.h}>
                  <span className="v-why__ic" aria-hidden>{f.icon}</span>
                  <h3>{f.h}</h3>
                  <p>{f.p}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="v-why__note">Faces, number plates and text are blurred on her phone before anything is sent. We never store other people&apos;s faces. Her face is never shared, and her data is deleted on request. Works on any Android phone in English, Hindi and Kannada.</p>
        </div>
      </section>

      {/* SKIN: image left, text right */}
      <section className="v-section" id="skin">
        <div className="v-wrap">
          <div className="v-band">
            <div className="v-band__img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/products/patch/patch-angled.webp" alt="INNAYA Patch, skin-safe puck" loading="lazy" />
            </div>
            <div className="v-band__text">
              <span className="v-eyebrow">Made for your skin</span>
              <h2>Gentle on the skin, every day.</h2>
              <p className="v-lead">
                Every piece that touches skin is gentle. The metals are hypoallergenic with no nickel worries, so they suit sensitive skin through heat and sweat. The patch uses a soft sticker for delicate skin; it holds about a week, lifts off cleanly, and the rings replace easily.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* GIFTING: text left, image right (alternating) */}
      <section className="v-section" id="gifting">
        <div className="v-wrap">
          <div className="v-band v-band--rev">
            <div className="v-band__img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/products/bangle/mother-of-pearl-front.webp" alt="INNAYA Bangle, a gift that says come home safe" loading="lazy" />
            </div>
            <div className="v-band__text">
              <span className="v-eyebrow">A gift that says &ldquo;come home safe&rdquo;</span>
              <h2>The gift they have waited to give.</h2>
              <p className="v-lead">
                For many families this is the gift they have waited to give. Parents, partners and siblings can give something beautiful that quietly looks after the one they love, ready to gift, with a simple message: wear this, move freely, come home safe.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* WAITLIST */}
      <section className="v-section v-section--center" id="waitlist">
        <div className="v-wrap">
          <span className="v-eyebrow">Stay connected</span>
          <h2>Express your interest.</h2>
          <p className="v-lead">Tell us which INNAYA pieces speak to you. We&apos;ll hold your launch price and be first to reach out at launch.</p>
          <Waitlist presetProduct={preset} />
        </div>
      </section>
    </main>
  );
}
