import type { Metadata } from "next";
import Link from "next/link";
import { BackControl } from "./_components/BackControl";
import { NavMemory } from "./_components/NavMemory";
import "./products.css";

export const metadata: Metadata = {
  title: "INNAYA · Jewellery that watches over you",
  description: "Timeless jewellery. Built for safety. A locket, brooch, kada or patch she loves to wear, ready to call for help before she reaches for a phone.",
};

// Plum-studio shell for the whole products site. The root layout stays neutral;
// this layout paints the aubergine→black ground and hosts the top bar + footer
// shared by the collection and every detail page. The INNAYA emblem + gradient
// wordmark are the brand, never a placeholder monogram.
export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="vaira">
      <NavMemory />
      <header className="v-top">
        <div className="v-wrap">
          <BackControl />
          <Link href="/products" className="v-brand" aria-label="INNAYA home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="v-brand__logo" src="/brand/emblem.webp" alt="" aria-hidden />
            <span className="v-brand__text">
              <span className="v-wordmark">INNAYA</span>
              <span className="v-brand__tag">Move freely. We&apos;ve got you.</span>
            </span>
          </Link>
          <nav aria-label="Sections">
            <span className="v-navlinks">
              <Link href="/products#collection" className="v-navlink">Collection</Link>
              <Link href="/products#why" className="v-navlink">Why INNAYA</Link>
            </span>
            <Link href="/products#waitlist" className="v-cta-pill">Reserve</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="v-footer">
        <div className="v-wrap">
          <span className="v-footer__brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/emblem.webp" alt="" aria-hidden />
            <span className="v-wordmark">INNAYA</span>
          </span>
          <span className="v-footer__motto">For her. With her. Always.</span>
          <span>© {new Date().getFullYear()} INNAYA · Timeless jewellery. Built for safety. Launch prices are indicative and may change before shipping.</span>
        </div>
      </footer>
    </div>
  );
}
