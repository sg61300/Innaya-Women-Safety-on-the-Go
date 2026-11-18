"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type Product, tierFor, designThumb, isHauteDesign, designPriceLabel } from "@/products/catalog";

type Slide = { src: string; alt: string; label: string };

// Interactive detail view: design swatches switch the piece in the gallery;
// finish swatches recolour every view (brooch); colour swatches swap a single
// finish image (Classic bangle); the scroller steps front → angled → side → back.
export function ProductDetail({ product, initialDesignId }: { product: Product; initialDesignId?: string }) {
  const designs = product.designs;
  const initialIndex = Math.max(0, designs.findIndex((d) => d.id === initialDesignId));
  const [di, setDi] = useState(initialIndex);
  const design = designs[di];
  const [finish, setFinish] = useState<string | undefined>(design.defaultFinish);
  const [colour, setColour] = useState<number | null>(null);
  const [vi, setVi] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  // Build the slides for the current selection.
  let slides: Slide[];
  if (design.colours && colour !== null) {
    const c = design.colours[colour];
    slides = [{ src: c.image, alt: `${design.name} in ${c.name}`, label: c.name }];
  } else if (design.finishes && finish) {
    slides = design.views.map((v) => ({ src: `/products/${product.slug}/${design.id}-${v.view}-${finish}.webp`, alt: v.alt, label: v.view }));
  } else {
    slides = design.views.map((v) => ({ src: v.src, alt: v.alt, label: v.view }));
  }

  const scrollTo = useCallback((i: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);

  // Reset to the first view whenever the slide set changes.
  useEffect(() => {
    setVi(0);
    scroller.current?.scrollTo({ left: 0 });
  }, [di, finish, colour]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== vi) setVi(Math.min(i, slides.length - 1));
  };

  function selectDesign(i: number) {
    setDi(i);
    setFinish(designs[i].defaultFinish);
    setColour(null);
  }

  // Price for the sticky bar = the selected design's price (lowest tier, else
  // "Price on request" for Haute / diamond-set). Changes with the design.
  const stickyPrice = designPriceLabel(product.slug, design);

  const finishName = design.finishes?.find((f) => f.id === finish)?.name;
  const atStart = vi <= 0;
  const atEnd = vi >= slides.length - 1;

  return (
    <>
      <div className="v-breadcrumb">
        <Link href="/products">Collection</Link>
        <span aria-hidden>›</span>
        <span style={{ color: "var(--ivory)" }}>{product.name}</span>
      </div>

      <div className="v-detail">
        {/* MEDIA */}
        <div className="v-detail__media">
          <div className="v-gallery">
            <div className="v-scroller" ref={scroller} onScroll={onScroll} tabIndex={0} role="group" aria-roledescription="carousel" aria-label={`${design.name} views`}>
              {slides.map((s, i) => (
                <div className="v-slide" key={s.src + i} aria-hidden={i !== vi} aria-label={`${i + 1} of ${slides.length}: ${s.label}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt={s.alt} draggable={false} />
                </div>
              ))}
            </div>
            {slides.length > 1 && (
              <>
                <button className="v-arrow v-arrow--prev" onClick={() => scrollTo(vi - 1)} disabled={atStart} aria-label="Previous view">‹</button>
                <button className="v-arrow v-arrow--next" onClick={() => scrollTo(vi + 1)} disabled={atEnd} aria-label="Next view">›</button>
              </>
            )}
          </div>
          {slides.length > 1 && (
            <div className="v-dots" role="tablist" aria-label="Choose a view">
              {slides.map((s, i) => (
                <button key={i} className="v-dot" aria-current={i === vi} aria-label={`View ${i + 1}: ${s.label}`} onClick={() => scrollTo(i)} />
              ))}
            </div>
          )}
          <div className="v-viewlabel">{slides[Math.min(vi, slides.length - 1)]?.label}{finishName ? ` · ${finishName}` : ""}</div>
        </div>

        {/* INFO */}
        <div className="v-detail__info">
          <h1 className="v-title">{product.name}</h1>
          <div className="v-designname">{design.name}</div>
          <p className="v-promise" style={{ margin: "14px 0 0", color: "var(--muted)" }}>{product.promise}</p>

          {/* design tiles: grouped Steel then Haute · diamond-set */}
          {designs.length > 1 && (() => {
            const indexed = designs.map((d, i) => ({ d, i }));
            const steel = indexed.filter((x) => !isHauteDesign(x.d));
            const haute = indexed.filter((x) => isHauteDesign(x.d));
            const tile = ({ d, i }: { d: typeof designs[number]; i: number }) => (
              <button key={d.id} className="v-designtile" type="button" aria-pressed={i === di} aria-label={d.name} title={d.name} onClick={() => selectDesign(i)}>
                <span className="v-designtile__img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={designThumb(d)} alt="" aria-hidden />
                </span>
                <span className="v-designtile__name">{d.name}</span>
              </button>
            );
            return (
              <div style={{ marginTop: 22 }}>
                <p className="v-label">Design · {design.name}</p>
                {steel.length > 0 && (
                  <>
                    {haute.length > 0 && <p className="v-tilegroup">Steel</p>}
                    <div className="v-designtiles" role="group" aria-label="Steel designs">{steel.map(tile)}</div>
                  </>
                )}
                {haute.length > 0 && (
                  <>
                    <p className="v-tilegroup v-tilegroup--haute">Haute · diamond-set <span>Price on request</span></p>
                    <div className="v-designtiles" role="group" aria-label="Haute diamond-set designs">{haute.map(tile)}</div>
                  </>
                )}
              </div>
            );
          })()}

          {/* finish swatches (brooch) */}
          {design.finishes && (
            <div style={{ marginTop: 18 }}>
              <p className="v-label">Finish{finishName ? ` · ${finishName}` : ""}</p>
              <div className="v-finishrow" role="group" aria-label="Choose a finish">
                {design.finishes.map((f) => (
                  <button key={f.id} className="v-finish" aria-pressed={f.id === finish} aria-label={f.name} title={f.name} onClick={() => setFinish(f.id)}>
                    <span style={{ background: f.hex }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* colour swatches (Classic bangle) */}
          {design.colours && (
            <div style={{ marginTop: 18 }}>
              <p className="v-label">Colour{colour !== null ? ` · ${design.colours[colour].name}` : ""}</p>
              <div className="v-swatchrow" role="group" aria-label="Choose a colour">
                <button className="v-swatch" aria-pressed={colour === null} onClick={() => setColour(null)}>All views</button>
                {design.colours.map((c, i) => (
                  <button key={c.name} className="v-swatch" aria-pressed={colour === i} onClick={() => setColour(i)}>
                    <span className="v-dotcolor" style={{ background: c.hex }} aria-hidden />
                    {c.name}{c.luxury ? " ·L" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* tiers */}
          <div style={{ marginTop: 26 }}>
            <p className="v-label">Tiers &amp; launch price</p>
            <div className="v-tiers">
              {design.tiers.map((tid) => {
                const t = tierFor(product.slug, tid);
                if (!t) return null;
                return (
                  <div key={tid} className={`v-tier${tid === "haute" ? " v-tier--haute" : ""}`}>
                    <div className="v-tier__head">
                      <span className="v-tier__name">{t.label}</span>
                      {t.price ? (
                        <span className="v-tier__price"><small>from </small>{t.price.replace("from ", "")}</span>
                      ) : (
                        <span className="v-tier__price v-tier__price--req">Price on request</span>
                      )}
                    </div>
                    <p className="v-tier__adds">{t.adds}</p>
                  </div>
                );
              })}
            </div>
            <p className="v-foot-note">Launch pricing, may change before shipping.</p>
          </div>

          {/* bullets + materials */}
          <ul className="v-bullets">
            {product.bullets.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <div className="v-made">
            <p style={{ margin: 0 }}><b>What it&apos;s made of.</b> {product.madeOf}</p>
            <p style={{ margin: "10px 0 0" }}><b>This design.</b> {design.materials}</p>
            {product.charging && <p style={{ margin: "10px 0 0" }}><b>Charging.</b> {product.charging}</p>}
            {product.finishes && <p style={{ margin: "10px 0 0" }}><b>Finishes.</b> {product.finishes}</p>}
            {product.skinNote && <p style={{ margin: "10px 0 0" }}><b>Skin note.</b> {product.skinNote}</p>}
          </div>

          <div className="v-detail__cta">
            <Link href={`/products?p=${product.slug}#waitlist`} className="v-btn v-btn--primary">Reserve launch price</Link>
            <Link href="/products" className="v-btn v-btn--ghost">Back to collection</Link>
          </div>
        </div>
      </div>

      {/* sticky reserve bar (mobile) */}
      <div className="v-sticky">
        <span className="v-price"><small style={{ color: "var(--muted)" }}>{design.name} · </small>{stickyPrice === "Price on request" ? "Price on request" : <><small>from </small>{stickyPrice.replace("from ", "")}</>}</span>
        <Link href={`/products?p=${product.slug}#waitlist`} className="v-btn v-btn--primary" style={{ minHeight: 44, padding: "0 20px" }}>Reserve</Link>
      </div>
    </>
  );
}
