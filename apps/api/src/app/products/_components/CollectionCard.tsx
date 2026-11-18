"use client";

import Link from "next/link";
import { useState } from "react";
import { type Product, designThumb, frontImage, designPriceLabel } from "@/products/catalog";

// A collection card that shows the whole product line: a thumbnail per design,
// finish/colour swatches under the selected design, and a live main image that
// swaps when a thumbnail or swatch is tapped. Tapping the image / name / View
// opens the detail page for the selected design. Every image is a single
// product cut-out on the studio ground.
export function CollectionCard({ product }: { product: Product }) {
  const designs = product.designs;
  const [di, setDi] = useState(0);
  const design = designs[di];
  const hasFinishes = !!design?.finishes?.length;
  const hasColours = !!design?.colours?.length;
  const [finish, setFinish] = useState<string | undefined>(design?.defaultFinish ?? design?.finishes?.[0]?.id);
  // colour designs default to the first colour; finish designs use no colour.
  const [colour, setColour] = useState<number | null>(hasColours ? 0 : null);

  function selectDesign(i: number) {
    const d = designs[i];
    setDi(i);
    setFinish(d.defaultFinish ?? d.finishes?.[0]?.id);
    setColour(d.colours?.length ? 0 : null);
  }

  const img = design ? frontImage(product.slug, design, finish, colour) : null;
  const href = design ? `/products/${product.slug}?d=${design.id}` : `/products/${product.slug}`;

  return (
    <div className="v-card">
      <Link href={href} className="v-card__imglink" aria-label={`${product.name}, ${design ? design.name : "view"}, view details`}>
        <div className="v-card__img">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={`${product.name}, ${design?.name ?? ""}`} loading="lazy" />
          ) : (
            <div className="v-emptytile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="v-emptytile__logo" src="/brand/emblem.webp" alt="" aria-hidden />
              <span className="v-emptytile__label">In the studio</span>
            </div>
          )}
        </div>
      </Link>

      <div className="v-card__body">
        <Link href={href}><div className="v-card__name">{product.name}</div></Link>
        <div className="v-card__sub">{product.sub}</div>

        {designs.length > 1 && (
          <div className="v-card__thumbs" role="group" aria-label={`${product.name} designs`}>
            {designs.map((d, i) => (
              <button
                key={d.id}
                type="button"
                className="v-thumb"
                aria-pressed={i === di}
                aria-label={d.name}
                title={d.name}
                onClick={() => selectDesign(i)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={designThumb(d)} alt="" aria-hidden />
              </button>
            ))}
          </div>
        )}

        {hasFinishes && (
          <div className="v-card__swatches" role="group" aria-label={`${design.name} finishes`}>
            {design.finishes!.map((f) => (
              <button
                key={f.id}
                type="button"
                className="v-mini"
                aria-pressed={f.id === finish}
                aria-label={f.name}
                title={f.name}
                onClick={() => setFinish(f.id)}
              >
                <span style={{ background: f.hex }} />
              </button>
            ))}
          </div>
        )}

        {hasColours && (
          <div className="v-card__swatches" role="group" aria-label={`${design.name} colours`}>
            {design.colours!.map((c, i) => (
              <button
                key={c.name}
                type="button"
                className="v-mini"
                aria-pressed={i === colour}
                aria-label={c.name}
                title={c.name}
                onClick={() => setColour(i)}
              >
                <span style={{ background: c.hex }} />
              </button>
            ))}
          </div>
        )}

        <div className="v-card__foot">
          <span className="v-price">
            {product.comingSoon
              ? <small>Coming soon</small>
              : design && (() => {
                  const label = designPriceLabel(product.slug, design);
                  return label.startsWith("from ")
                    ? <><small>from </small>{label.replace("from ", "")}</>
                    : <small style={{ color: "var(--gold-line)" }}>{label}</small>;
                })()}
          </span>
          <Link href={href} className={`v-chip${product.comingSoon ? " v-soon" : ""}`}>{product.comingSoon ? "Soon" : "View"}</Link>
        </div>
      </div>
    </div>
  );
}
