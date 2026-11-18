// INNAYA products: single typed source of truth for the products site.
//
// Every price, material word and design name here traces to a founder-approved
// source; nothing is invented:
//   - prices / tiers:      brief §Catalogue (rulings R52/R53/R55): "launch, from"
//   - product copy:        Design/06-products-customer-copy.md §§1–6 (verbatim)
//   - design names/views:  the founder's marketing sheets (sliced into
//                          /public/products/<slug>/<design>-<view>.webp)
//   - materials:           Design/05-products-sales-brief.md, in plain words
//   - swatch hexes:        sampled from the real renders by scripts/products-images.py
//
// Do NOT add technical codes, "GPS", battery-day claims for pendant/brooch/eye,
// or any §7 "Do not say" term. "Siren" appears only on the "+ Siren" design.

export type TierId = "lite" | "standard" | "pro" | "luxury" | "haute";

export type Tier = {
  id: TierId;
  label: string;
  /** Shown as the price line. `null` = Haute, price on request. */
  price: string | null;
  /** What this tier adds. Material facts only. */
  adds: string;
};

export type Colour = {
  name: string;
  hex: string;
  image: string;
  /** Some finishes step up to the Luxury tier. */
  luxury?: boolean;
};

// A metal finish that recolours EVERY view (per-view recolour renders exist as
// /products/<slug>/<design>-<view>-<id>.webp). The gallery rebuilds each view's
// src from the selected finish id.
export type Finish = { id: string; name: string; hex: string };

// The three PVD finishes shown as swatches everywhere (§2 approved copy).
// oxidised-silver and polished-silver are intentionally NOT offered: the
// polished-silver set is defective (cut/half renders) and, per founder ruling
// (v3), swatch rows show only rose gold, gunmetal and gold. Those files stay on
// disk; scripts/check-images.mjs still rejects the known-defective ones.
export const STEEL_FINISHES: Finish[] = [
  { id: "rose-gold", name: "Rose gold", hex: "#CB8A64" },
  { id: "gold", name: "Gold", hex: "#CBAD5C" },
  { id: "gunmetal", name: "Gunmetal", hex: "#888B8F" },
];

export type Design = {
  id: string;
  name: string;
  /** One-line materials, plain words. */
  materials: string;
  /** Swatch circle colour, sampled from the render. */
  hex: string;
  /** Ordered view images: front → angled → side → back. */
  views: { view: string; src: string; alt: string }[];
  /** Tiers offered for this design, in order. */
  tiers: TierId[];
  /** Optional colour swatches that swap a single shown image (Classic bangle). */
  colours?: Colour[];
  /** Optional metal finishes that recolour all views (brooch; pendant pending). */
  finishes?: Finish[];
  /** The finish id the `views` above are rendered in (default shown state). */
  defaultFinish?: string;
};

export type Product = {
  slug: string;
  name: string;
  /** Collection-card sub-line (the piece's nickname / who it's for). */
  sub: string;
  /** One-line promise (from copy §2 italic line). */
  promise: string;
  bullets: string[];
  madeOf: string;
  charging?: string;
  finishes?: string;
  skinNote?: string;
  /** Collection-card price label. */
  fromLabel: string;
  /** Default design shown first. */
  designs: Design[];
  /** Related product slugs for the detail-page row. */
  related: string[];
  comingSoon?: boolean;
};

// ---------------------------------------------------------------- tiers ------
// Tier "adds" lines use only material facts from Design/05.
const T = {
  lite: (price: string): Tier => ({ id: "lite", label: "Lite", price, adds: "The lightest, most affordable way in." }),
  standard: (price: string): Tier => ({ id: "standard", label: "Standard", price, adds: "Surgical-grade steel with a PVD gold, rose-gold or gunmetal finish." }),
  pro: (price: string): Tier => ({ id: "pro", label: "Pro", price, adds: "Adds a sapphire glass face that shrugs off scratches." }),
  luxury: (price: string): Tier => ({ id: "luxury", label: "Luxury", price, adds: "A thicker gold or sterling-silver shell, sapphire face, a stone or enamel accent, free engraving and a leather presentation box." }),
  bangleStandard: (price: string): Tier => ({ id: "standard", label: "Standard", price, adds: "Solid metal with a lasting gold or oxidised-silver finish and an enamel or kundan-style medallion." }),
  bangleLuxury: (price: string): Tier => ({ id: "luxury", label: "Luxury", price, adds: "A gold-plated or sterling-silver band, a stone accent, free engraving and a leather presentation box." }),
  haute: (): Tier => ({ id: "haute", label: "Haute", price: null, adds: "Diamond-set. Price on request, launching after the core collection." }),
};

// A flat pool of every tier variant used across products, so the detail page can
// look up the price line for any (product, tier) pair.
export const TIERS: Record<string, Record<TierId, Tier | undefined>> = {
  pendant: { lite: T.lite("from ₹3,499"), standard: T.standard("from ₹6,999"), pro: T.pro("from ₹11,999"), luxury: T.luxury("from ₹14,999"), haute: T.haute() },
  brooch: { lite: undefined, standard: T.standard("from ₹6,999"), pro: undefined, luxury: T.luxury("from ₹14,999"), haute: T.haute() },
  bangle: { lite: undefined, standard: T.bangleStandard("from ₹4,999"), pro: undefined, luxury: T.bangleLuxury("from ₹12,999"), haute: T.haute() },
  patch: { lite: undefined, standard: { id: "standard", label: "Standard", price: "from ₹2,999", adds: "A soft, skin-safe puck with a hypoallergenic sticker ring; rings replace in packs of ten." }, pro: undefined, luxury: undefined, haute: undefined },
  eye: { lite: undefined, standard: { id: "standard", label: "Standard", price: "from ₹4,999", adds: "A discreet button shell built to blend into your outerwear." }, pro: undefined, luxury: undefined, haute: undefined },
};

// --------------------------------------------------------------- helpers -----
const VIEW_ORDER = ["front", "angled", "side", "back"] as const;

// Views dropped from the catalogue because their render is a cropped
// contact-sheet fragment (a second object's edge, or a full-bleed grid crop),
// found by scripts/quality-gate.mjs and eyeball-confirmed (2026-09-07). Keyed by
// "<slug>/<design>" -> the view names to hide. The image files stay on disk for
// re-render reference; scripts/check-images.mjs denies them so they can never be
// referenced again until re-rendered.
const NEEDS_RERENDER: Record<string, ReadonlySet<string>> = {
  "bangle/classic": new Set(["side"]),
  "bangle/filigree-cutout": new Set(["side"]),
  "bangle/mother-of-pearl": new Set(["side"]),
  "bangle/diamond-pave": new Set(["side"]),
  "bangle/diamond-line": new Set(["side"]),
  "brooch/onyx-diamond": new Set(["side"]),
};
function keptViews(slug: string, design: string) {
  const drop = NEEDS_RERENDER[`${slug}/${design}`];
  return drop ? VIEW_ORDER.filter((v) => !drop.has(v)) : VIEW_ORDER;
}

function views(slug: string, design: string, name: string) {
  return keptViews(slug, design).map((v) => ({ view: v, src: `/products/${slug}/${design}-${v}.webp`, alt: `${name}, ${v} view` }));
}
// Views rendered in a specific finish: /products/<slug>/<design>-<view>-<finish>.webp
function viewsF(slug: string, design: string, name: string, finish: string) {
  return keptViews(slug, design).map((v) => ({ view: v, src: `/products/${slug}/${design}-${v}-${finish}.webp`, alt: `${name}, ${v} view` }));
}

// ------------------------------------------------------------- products -------
export const PRODUCTS: Product[] = [
  {
    slug: "pendant",
    name: "Pendant “Locket”",
    sub: "Looks like jewellery, works like a guardian.",
    promise: "An everyday locket no one can tell apart, ready to call for help before you reach for a phone.",
    bullets: [
      "Looks like an everyday locket. No one can tell it apart.",
      "Notices trouble on its own and reaches your people before you can ask.",
      "Light to wear all day, with a tough glass face (sapphire on the Pro) and a chain that fits any you own.",
    ],
    madeOf: "Surgical-grade steel that stays kind to sensitive skin, sealed against rain and sweat.",
    charging: "On its magnetic cradle. Nothing to plug in.",
    finishes: "Gold, rose gold, gunmetal.",
    fromLabel: "from ₹3,499",
    related: ["brooch", "patch", "eye"],
    designs: [
      { id: "locket-slim", name: "Locket Slim", materials: "Rose-gold-finish steel with a discreet black-stone centre.", hex: "#D8946E", views: viewsF("pendant", "locket-slim", "Locket Slim pendant", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["lite", "standard", "pro", "luxury"] },
      { id: "round-slim", name: "Round Slim", materials: "A slim, modern round pendant in rose-gold-finish steel.", hex: "#D69571", views: viewsF("pendant", "round-slim", "Round Slim pendant", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["lite", "standard", "pro", "luxury"] },
      { id: "classic-segments", name: "Classic Segments", materials: "Rose-gold-finish steel with a black-stone centre framed by six enamel segments.", hex: "#E09B70", views: [{ view: "front", src: "/products/pendant/classic-segments-front-rose-gold.webp", alt: "Classic Segments pendant, front view" }], finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["lite", "standard", "pro", "luxury"] },
      { id: "locket-slim-siren", name: "Locket Slim + Siren", materials: "Rose-gold-finish steel with an integrated siren and a black-stone centre.", hex: "#D5916C", views: viewsF("pendant", "locket-slim-siren", "Locket Slim plus Siren pendant", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["standard", "pro", "luxury"] },
      { id: "diamond-pendant", name: "Diamond Pendant", materials: "Rose-gold-finish steel set with a full pavé of diamonds.", hex: "#CA8A62", views: viewsF("pendant", "diamond-pendant", "Diamond pendant", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["haute"] },
      { id: "classic-baguette", name: "Baguette Cross", materials: "Four baguette-cut diamonds set in a cross over rose-gold-finish steel.", hex: "#E3A277", views: [{ view: "front", src: "/products/pendant/classic-baguette-front-rose-gold.webp", alt: "Baguette Cross pendant, front view" }], finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["haute"] },
    ],
  },
  {
    slug: "brooch",
    name: "Brooch “Disc”",
    sub: "For the saree, dupatta, blazer, or anyone who skips necklaces.",
    promise: "Pins to a pallu, dupatta or lapel and reads as a plain decorative disc, while it watches over you.",
    bullets: [
      "Pins to a pallu, dupatta or lapel; reads as a plain decorative disc.",
      "Notices trouble and calls your people on its own.",
      "Very light on the fabric, so it sits flat and stays put.",
    ],
    madeOf: "The same skin-kind surgical-grade steel, sealed against rain and sweat.",
    charging: "On its magnetic cradle.",
    finishes: "Gold, rose gold, gunmetal.",
    fromLabel: "from ₹6,999",
    related: ["pendant", "bangle", "patch"],
    designs: [
      { id: "classic-rose-gold", name: "Classic Rose Gold", materials: "Rose-gold-finish steel with a black-stone centre.", hex: "#CB8A64", views: viewsF("brooch", "classic-rose-gold", "Classic Rose Gold brooch", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["standard"] },
      { id: "sunburst-cutout", name: "Sunburst Cutout", materials: "A pierced sunburst pattern in rose-gold-finish steel.", hex: "#CF906A", views: viewsF("brooch", "sunburst-cutout", "Sunburst Cutout brooch", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["standard", "luxury"] },
      { id: "diamond-pave", name: "Diamond Pavé", materials: "A full pavé of diamonds over rose-gold-finish steel.", hex: "#D39977", views: viewsF("brooch", "diamond-pave", "Diamond Pavé brooch", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["haute"] },
      { id: "halo-diamond", name: "Halo Diamond", materials: "A mother-of-pearl face ringed by a halo of diamonds.", hex: "#D49A76", views: viewsF("brooch", "halo-diamond", "Halo Diamond brooch", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["haute"] },
      { id: "onyx-diamond", name: "Onyx & Diamond", materials: "A black onyx face with a diamond centre.", hex: "#3B3733", views: viewsF("brooch", "onyx-diamond", "Onyx and Diamond brooch", "rose-gold"), finishes: STEEL_FINISHES, defaultFinish: "rose-gold", tiers: ["haute"] },
    ],
  },
  {
    slug: "bangle",
    name: "Bangle “Kada”",
    sub: "A traditional kada with a hidden call for help on your wrist.",
    promise: "Looks like a classic kada. A covert press on the medallion sends for help, no phone in hand.",
    bullets: [
      "Looks like a classic kada, with an enamel or kundan-style medallion.",
      "A covert press on the medallion sends for help, no phone in hand.",
      "Senses your pulse, lasts about a week on a charge, and is light enough to keep on.",
    ],
    madeOf: "Solid metal with a lasting gold or oxidised-silver finish, kind to skin, in a sealed pod for rain and monsoon.",
    finishes: "Gold, rose gold, gunmetal.",
    fromLabel: "from ₹4,999",
    related: ["pendant", "brooch", "patch"],
    designs: [
      {
        id: "classic", name: "Classic", materials: "Solid metal with a gold or oxidised-silver finish and an enamel or kundan-style medallion.", hex: "#CD916A",
        views: views("bangle", "classic", "Classic bangle"), tiers: ["standard", "luxury"],
        colours: [
          { name: "Gold", hex: "#DBC074", image: "/products/bangle/classic-colour-gold.webp" },
          { name: "Rose gold", hex: "#DB9A79", image: "/products/bangle/classic-colour-rose-gold.webp" },
          { name: "Gunmetal", hex: "#999B9F", image: "/products/bangle/classic-colour-gunmetal.webp" },
        ],
      },
      { id: "filigree-cutout", name: "Filigree Cutout", materials: "A pierced floral medallion on a rose-gold-finish band.", hex: "#C88A63", views: views("bangle", "filigree-cutout", "Filigree Cutout bangle"), tiers: ["standard"] },
      { id: "mother-of-pearl", name: "Mother of Pearl", materials: "A mother-of-pearl medallion on a rose-gold-finish band.", hex: "#C78A63", views: views("bangle", "mother-of-pearl", "Mother of Pearl bangle"), tiers: ["luxury"] },
      { id: "diamond-pave", name: "Diamond Pavé", materials: "A full pavé of diamonds across the medallion.", hex: "#C78962", views: views("bangle", "diamond-pave", "Diamond Pavé bangle"), tiers: ["haute"] },
      { id: "diamond-line", name: "Diamond Line", materials: "A single line of diamonds across the medallion.", hex: "#CD9069", views: views("bangle", "diamond-line", "Diamond Line bangle"), tiers: ["haute"] },
    ],
  },
  {
    slug: "patch",
    name: "Patch",
    sub: "Invisible under clothes, a full week of quiet cover.",
    promise: "Thin and rounded, so it disappears under any outfit: a covert SOS with no mic and no camera.",
    bullets: [
      "Thin and rounded, so it disappears under any outfit.",
      "Senses your pulse and sends a covert SOS; if it comes off during a journey, it checks in with your guardian.",
      "No microphone and no camera, it never listens or watches, about a week on a charge.",
    ],
    madeOf: "A soft, skin-safe puck with a gentle, hypoallergenic sticker ring that holds about a week and peels off cleanly; rings are replaceable, in packs of ten.",
    skinNote: "This is a wellness and safety device. It does not diagnose or treat any health condition.",
    fromLabel: "from ₹2,999",
    related: ["pendant", "bangle", "eye"],
    designs: [
      { id: "patch", name: "Patch", materials: "A soft, skin-safe puck with a hypoallergenic sticker ring.", hex: "#CE9B88", views: views("patch", "patch", "Patch"), tiers: ["standard"] },
    ],
  },
  {
    slug: "eye",
    name: "Eye button camera",
    sub: "A second pair of eyes, hidden in a coat button.",
    promise: "Looks like an ordinary button, the perfect add-on to a pendant or patch for full cover.",
    bullets: [
      "Looks like an ordinary button on a coat or shirt.",
      "Sees what happens and calls your people, with bystanders' faces hidden.",
      "The perfect add-on to a pendant or patch for full cover.",
    ],
    madeOf: "A discreet button shell built to blend into your outerwear.",
    charging: "On its magnetic cradle.",
    fromLabel: "from ₹4,999",
    related: ["pendant", "patch", "brooch"],
    comingSoon: true,
    designs: [],
  },
];

export const PRODUCT_MAP: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.slug, p]));

export function tierFor(slug: string, id: TierId): Tier | undefined {
  return TIERS[slug]?.[id];
}

// A design is "Haute · diamond-set" when its only tier is Haute. Used to group
// the design tiles (Steel vs Haute) and to switch the shown price.
export function isHauteDesign(d: Design): boolean {
  return d.tiers.length > 0 && d.tiers.every((t) => t === "haute");
}

// The price line to show for a design: its lowest priced tier, else "Price on
// request" (Haute / diamond-set). Keeps card + detail prices in sync.
export function designPriceLabel(slug: string, d: Design): string {
  const priced = d.tiers.map((t) => tierFor(slug, t)).filter(Boolean) as Tier[];
  const withPrice = priced.find((t) => t.price);
  return withPrice ? withPrice.price! : "Price on request";
}

// -------------------------------------------------------- image helpers ------
// Shared by the collection cards, the detail gallery and the build-time image
// check so every surface resolves the same src for a (design, finish, colour).
function frontView(design: Design) {
  return design.views.find((v) => v.view === "front") ?? design.views[0];
}

/** Representative thumbnail for a design tile (its default front render). */
export function designThumb(design: Design): string {
  return frontView(design)?.src ?? "";
}

/** The front image for a design given the active finish or colour selection. */
export function frontImage(slug: string, design: Design, finishId?: string, colourIndex?: number | null): string {
  if (design.colours && colourIndex != null && colourIndex >= 0) return design.colours[colourIndex].image;
  const fv = frontView(design);
  if (design.finishes && finishId) return `/products/${slug}/${design.id}-${finishId ? fv.view + "-" + finishId : fv.view}.webp`;
  return fv?.src ?? "";
}

/** Every image path the catalogue can display, for the build-time existence check. */
export function allImageRefs(): string[] {
  const refs = new Set<string>();
  for (const p of PRODUCTS) {
    for (const d of p.designs) {
      refs.add(designThumb(d));
      if (d.finishes) {
        for (const f of d.finishes) for (const v of d.views) refs.add(`/products/${p.slug}/${d.id}-${v.view}-${f.id}.webp`);
      } else {
        for (const v of d.views) refs.add(v.src);
      }
      if (d.colours) for (const c of d.colours) refs.add(c.image);
    }
  }
  refs.delete("");
  return [...refs];
}
