import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCTS, PRODUCT_MAP } from "@/products/catalog";
import { ProductDetail } from "../_components/ProductDetail";
import { PageOpenedBeacon } from "../_components/PageOpenedBeacon";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = PRODUCT_MAP[slug];
  if (!p) return { title: "INNAYA" };
  return { title: `${p.name} · INNAYA`, description: p.promise };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { slug } = await params;
  const { d } = await searchParams;
  const product = PRODUCT_MAP[slug];
  if (!product) notFound();

  const related = product.related.map((s) => PRODUCT_MAP[s]).filter(Boolean);

  return (
    <main className="v-wrap">
      <PageOpenedBeacon type="product_viewed" product={product.slug} />
      {product.comingSoon || product.designs.length === 0 ? (
        <ComingSoon slug={product.slug} name={product.name} sub={product.sub} promise={product.promise} bullets={product.bullets} madeOf={product.madeOf} />
      ) : (
        <ProductDetail product={product} initialDesignId={d} />
      )}

      {/* related */}
      <section className="v-section">
        <span className="v-eyebrow">Pairs well with</span>
        <h2 style={{ fontSize: 26, marginTop: 6 }}>More of the collection</h2>
        <div className="v-related">
          {related.map((r) => {
            const img = r.designs[0]?.views[0]?.src ?? null;
            return (
              <Link key={r.slug} href={`/products/${r.slug}`} className="v-card" aria-label={`${r.name}, view details`}>
                <div className="v-card__img" style={{ aspectRatio: "1 / 1", padding: 18 }}>
                  {img ? (
                    <img src={img} alt={r.name} loading="lazy" />
                  ) : (
                    <div className="v-emptytile">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="v-emptytile__logo" src="/brand/emblem.webp" alt="" aria-hidden />
                      <span className="v-emptytile__label">In the studio</span>
                    </div>
                  )}
                </div>
                <div className="v-card__body" style={{ padding: "14px 16px 18px" }}>
                  <div className="v-card__name" style={{ fontSize: 17 }}>{r.name}</div>
                  <div className="v-card__foot">
                    <span className="v-price">{r.comingSoon ? <small>Coming soon</small> : <><small>from </small>{r.fromLabel.replace("from ", "")}</>}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function ComingSoon({ slug, name, sub, promise, bullets, madeOf }: { slug: string; name: string; sub: string; promise: string; bullets: string[]; madeOf: string }) {
  return (
    <>
      <div className="v-breadcrumb">
        <Link href="/products">Collection</Link>
        <span aria-hidden>›</span>
        <span style={{ color: "var(--ivory)" }}>{name}</span>
      </div>
      <div className="v-detail">
        <div className="v-detail__media">
          <div className="v-scroller" style={{ cursor: "default" }}>
            <div className="v-slide">
              <div className="v-emptytile">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="v-emptytile__logo" src="/brand/emblem.webp" alt="" aria-hidden />
                <span className="v-emptytile__label">In the studio</span>
              </div>
            </div>
          </div>
          <div className="v-viewlabel">Coming soon</div>
        </div>
        <div className="v-detail__info">
          <h1 className="v-title">{name}</h1>
          <div className="v-designname">{sub}</div>
          <p className="v-promise" style={{ margin: "14px 0 0", color: "var(--muted)" }}>{promise}</p>
          <span className="v-chip v-soon" style={{ display: "inline-block", marginTop: 18 }}>Coming soon</span>
          <ul className="v-bullets">
            {bullets.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <div className="v-made"><p style={{ margin: 0 }}><b>What it&apos;s made of.</b> {madeOf}</p></div>
          <div style={{ marginTop: 26 }}>
            <Link href={`/products?p=${slug}#waitlist`} className="v-btn v-btn--primary">Reserve your launch price</Link>
          </div>
        </div>
      </div>
    </>
  );
}
