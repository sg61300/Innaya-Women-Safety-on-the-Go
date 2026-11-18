#!/usr/bin/env python3
"""
products-images.py — build the VAIRA products-site imagery from the founder's
marketing sheets.

What it does
------------
1. Slices each marketing grid into per-design, per-view tiles.
2. Removes the near-white studio background (border-connected light/grey pixels,
   shadows included) so every piece floats on the dark page ground.
3. Keeps only the product blob per tile, which drops the sheets' caption /
   label text ("Front View", "1. CLASSIC ROSE GOLD", ...).
4. Trims, resizes and writes web-ready .webp, each <= 250 KB.
5. Emits brand marks + PWA icons.
6. Prints a swatch-hex per design/colour so catalog.ts can quote real colours.

Sources are read-only in the vault brand/products folder. All writes land under
a local drive (the repo's apps/api/public and, for the identified pendant sheet, a copy
into the vault). Nothing is written to C:.

Run:  python apps/api/scripts/products-images.py
Needs: Pillow, numpy, scipy (all present in the project's Python 3.12).
"""
from __future__ import annotations
import os, shutil, sys
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

# ---------------------------------------------------------------- paths -------
VAULT = r"./assets/brand"
PROD = os.path.join(VAULT, "products")
HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.abspath(os.path.join(HERE, "..", "public"))
# The identified pendant/patch sheet (downloaded), filed into the vault below.
PENDANT_SRC_DOWNLOAD = r"./assets/pendant-source.png"
PENDANT_IN_VAULT = os.path.join(PROD, "pendant-grid-white.png")

VIEWS = ["front", "angled", "side", "back"]


def out_dir(slug: str) -> str:
    d = os.path.join(PUBLIC, "products", slug)
    os.makedirs(d, exist_ok=True)
    return d


# ----------------------------------------------------- background removal -----
def cut_out(rgb: Image.Image) -> Image.Image:
    """Return an RGBA image with the studio background made transparent and only
    the largest product blob kept (drops caption/label text and stray specks)."""
    arr = np.asarray(rgb.convert("RGB")).astype(np.int16)
    mn = arr.min(axis=2)
    mx = arr.max(axis=2)
    # Background = light AND near-neutral (white paper + soft grey shadow).
    bg_like = (mn > 200) & ((mx - mn) < 24)
    lbl, n = ndimage.label(bg_like)
    border = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    border.discard(0)
    if border:
        bg = np.isin(lbl, list(border))
    else:
        bg = np.zeros_like(bg_like)
    fg = ~bg
    # Keep the product blob(s): largest component, plus any >= 15% of it.
    flbl, fn = ndimage.label(fg)
    if fn:
        sizes = ndimage.sum(np.ones_like(flbl), flbl, index=range(1, fn + 1))
        keep = {i + 1 for i, s in enumerate(sizes) if s >= 0.15 * sizes.max()}
        fg = np.isin(flbl, list(keep))
    alpha = np.where(fg, 255.0, 0.0)
    # Feather the edge a touch to avoid a hard white fringe on dark ground.
    alpha = ndimage.gaussian_filter(alpha, 0.7)
    out = np.dstack([arr.astype(np.uint8), alpha.clip(0, 255).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def export(rgba: Image.Image, path: str, max_side: int = 1000) -> int:
    a = rgba.getchannel("A")
    box = a.getbbox()
    if box:
        rgba = rgba.crop(box)
    pad = max(6, int(0.04 * max(rgba.size)))
    rgba = ImageOps.expand(rgba, pad, (0, 0, 0, 0))
    if max(rgba.size) > max_side:
        r = max_side / max(rgba.size)
        rgba = rgba.resize((round(rgba.width * r), round(rgba.height * r)), Image.LANCZOS)
    q = 85
    while True:
        rgba.save(path, "WEBP", quality=q, method=6)
        if os.path.getsize(path) <= 250 * 1024 or q <= 45:
            break
        q -= 10
    return os.path.getsize(path)


def swatch_hex(rgba: Image.Image) -> str:
    """Representative colour = median of the most saturated opaque pixels."""
    arr = np.asarray(rgba.convert("RGBA"))
    op = arr[:, :, 3] > 200
    rgb = arr[:, :, :3][op].astype(np.int16)
    if len(rgb) == 0:
        return "#888888"
    sat = rgb.max(axis=1) - rgb.min(axis=1)
    thr = np.percentile(sat, 60)
    sel = rgb[sat >= thr]
    if len(sel) == 0:
        sel = rgb
    med = np.median(sel, axis=0).astype(int)
    return "#%02X%02X%02X" % (med[0], med[1], med[2])


# ----------------------------------------------------------- slicing ----------
def slice_grid(img: Image.Image, rows: int, cols: int, x0=0, y0=0, x1=None, y1=None):
    """Yield (r, c, cell RGB) over an evenly divided grid within the box."""
    x1 = img.width if x1 is None else x1
    y1 = img.height if y1 is None else y1
    cw = (x1 - x0) / cols
    ch = (y1 - y0) / rows
    for r in range(rows):
        for c in range(cols):
            box = (int(x0 + c * cw), int(y0 + r * ch), int(x0 + (c + 1) * cw), int(y0 + (r + 1) * ch))
            yield r, c, img.crop(box)


def do_grid(src: str, slug: str, designs: list[str], rows: int, cols: int, **box):
    """Slice a designs x views grid; write <design>-<view>.webp; return hexes."""
    img = Image.open(src)
    tiles = {}
    for r, c, cell in slice_grid(img, rows, cols, **box):
        tiles[(r, c)] = cut_out(cell)
    hexes = {}
    for r, design in enumerate(designs):
        hexes[design] = swatch_hex(tiles[(r, 0)])
        for c, view in enumerate(VIEWS):
            kb = export(tiles[(r, c)], os.path.join(out_dir(slug), f"{design}-{view}.webp"))
            print(f"  {slug}/{design}-{view}.webp  {kb//1024} KB")
    return hexes


def do_colourways(slug: str, design: str, colours: dict[str, str]):
    hexes = {}
    for name, src in colours.items():
        rgba = cut_out(Image.open(src))
        hexes[name] = swatch_hex(rgba)
        kb = export(rgba, os.path.join(out_dir(slug), f"{design}-colour-{name}.webp"))
        print(f"  {slug}/{design}-colour-{name}.webp  {kb//1024} KB")
    return hexes


def process_singles(slug: str, mapping: dict[str, str]):
    """Cut out and export already-single-product PNGs. Returns {out_name: hex}."""
    hexes = {}
    for out_name, src in mapping.items():
        if not os.path.exists(src):
            print(f"  SKIP (missing) {src}")
            continue
        rgba = cut_out(Image.open(src))
        hexes[out_name] = swatch_hex(rgba)
        kb = export(rgba, os.path.join(out_dir(slug), f"{out_name}.webp"))
        print(f"  {slug}/{out_name}.webp  {kb//1024} KB")
    return hexes


def brooch_finishes():
    """Per-view, per-finish brooch recolours from assets/brand/products/brooch/.
    Files: <design>-<view>-<finish>.png -> /products/brooch/<same>.webp."""
    src_dir = os.path.join(PROD, "brooch")
    if not os.path.isdir(src_dir):
        print("  brooch finish folder not present — skipping")
        return {}
    designs = ["classic-rose-gold", "diamond-pave", "halo-diamond", "sunburst-cutout", "onyx-diamond"]
    finishes = ["gold", "rose-gold", "polished-silver", "oxidised-silver", "gunmetal"]
    mapping = {}
    for d in designs:
        for v in VIEWS:
            for f in finishes:
                stem = f"{d}-{v}-{f}"
                p = os.path.join(src_dir, stem + ".png")
                if os.path.exists(p):
                    mapping[stem] = p
    return process_singles("brooch", mapping)


def pendant_finishes():
    """Per-view, per-finish pendant designs from assets/brand/products/pendant/.
    Full designs have 4 views; classic-segments & classic-baguette are front-only."""
    src_dir = os.path.join(PROD, "pendant")
    if not os.path.isdir(src_dir):
        print("  pendant finish folder not present — skipping")
        return {}
    full = ["locket-slim", "round-slim", "diamond-pendant", "locket-slim-siren"]
    front_only = ["classic-segments", "classic-baguette"]
    finishes = ["rose-gold", "gold", "polished-silver", "oxidised-silver", "gunmetal"]
    mapping = {}
    for d in full:
        for v in VIEWS:
            for f in finishes:
                stem = f"{d}-{v}-{f}"
                p = os.path.join(src_dir, stem + ".png")
                if os.path.exists(p):
                    mapping[stem] = p
    for d in front_only:
        for f in finishes:
            stem = f"{d}-front-{f}"
            p = os.path.join(src_dir, stem + ".png")
            if os.path.exists(p):
                mapping[stem] = p
    return process_singles("pendant", mapping)


def brand_and_icons():
    os.makedirs(os.path.join(PUBLIC, "brand"), exist_ok=True)
    os.makedirs(os.path.join(PUBLIC, "icons"), exist_ok=True)
    for name in ("emblem", "lockup"):
        src = os.path.join(VAULT, f"{name}-1024.png")
        im = Image.open(src).convert("RGBA")
        if max(im.size) > 1000:
            r = 1000 / max(im.size)
            im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
        p = os.path.join(PUBLIC, "brand", f"{name}.webp")
        q = 90
        while True:
            im.save(p, "WEBP", quality=q, method=6)
            if os.path.getsize(p) <= 250 * 1024 or q <= 45:
                break
            q -= 10
        print(f"  brand/{name}.webp  {os.path.getsize(p)//1024} KB")
    # PWA icons: emblem centred on the page's near-black ground.
    emblem = Image.open(os.path.join(VAULT, "emblem-1024.png")).convert("RGBA")
    for size in (192, 512):
        bg = Image.new("RGBA", (size, size), (11, 11, 12, 255))
        e = emblem.copy()
        pad = int(size * 0.16)
        e.thumbnail((size - 2 * pad, size - 2 * pad), Image.LANCZOS)
        bg.alpha_composite(e, ((size - e.width) // 2, (size - e.height) // 2))
        p = os.path.join(PUBLIC, "icons", f"icon-{size}.png")
        bg.convert("RGB").save(p, "PNG")
        print(f"  icons/icon-{size}.png")


def main():
    print("PUBLIC:", PUBLIC)
    # Incremental modes so the slow grid slicing need not be repeated.
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    if mode in ("finishes", "singles"):
        print("Brooch finishes:")
        brooch_finishes()
        print("Pendant finishes:")
        print(pendant_finishes())
        return
    # File the identified pendant/patch sheet into the vault (read-only source
    # otherwise; we only ADD this file).
    if not os.path.exists(PENDANT_IN_VAULT) and os.path.exists(PENDANT_SRC_DOWNLOAD):
        shutil.copy2(PENDANT_SRC_DOWNLOAD, PENDANT_IN_VAULT)
        print("Filed pendant sheet ->", PENDANT_IN_VAULT)

    allhex = {}
    # Pendant designs now come from per-finish single-product renders in
    # products/pendant/ (see pendant_finishes below), not the grid. Only the
    # patch (row 5 of the pendant/patch sheet) is still sliced from the grid.
    print("Patch (row 5 of the pendant/patch sheet):")
    print("Patch (row 5 of the pendant/patch sheet):")
    img = Image.open(PENDANT_IN_VAULT)
    y0 = int(4 * 1254 / 5)
    patchhex = None
    for _, c, cell in slice_grid(img, 1, 4, x0=270, x1=1254, y0=y0, y1=1254):
        rgba = cut_out(cell)
        if c == 0:
            patchhex = swatch_hex(rgba)
        export(rgba, os.path.join(out_dir("patch"), f"patch-{VIEWS[c]}.webp"))
        print(f"  patch/patch-{VIEWS[c]}.webp")
    allhex["patch"] = {"patch": patchhex}

    print("Brooch (5 designs x 4 views):")
    allhex["brooch"] = do_grid(
        os.path.join(PROD, "brooch-grid-white.png"), "brooch",
        ["classic-rose-gold", "diamond-pave", "halo-diamond", "sunburst-cutout", "onyx-diamond"],
        rows=5, cols=4,
    )

    print("Bangle designs (rows of the bangle sheet; row2 plain duplicate skipped):")
    # Sheet rows: 1 Classic, 2 (plain duplicate), 3 Diamond Pave, 4 Diamond Line,
    # 5 Filigree Cutout, 6 Mother of Pearl. Map only the named designs.
    bimg = Image.open(os.path.join(PROD, "bangle-sheet-black.png"))
    rowmap = {0: "classic", 2: "diamond-pave", 3: "diamond-line", 4: "filigree-cutout", 5: "mother-of-pearl"}
    tiles = {}
    for r, c, cell in slice_grid(bimg, 6, 4):
        if r in rowmap:
            tiles[(r, c)] = cut_out(cell)
    bhex = {}
    for r, design in rowmap.items():
        bhex[design] = swatch_hex(tiles[(r, 0)])
        for c, view in enumerate(VIEWS):
            export(tiles[(r, c)], os.path.join(out_dir("bangle"), f"{design}-{view}.webp"))
            print(f"  bangle/{design}-{view}.webp")
    allhex["bangle"] = bhex

    print("Bangle Classic colourways (single view each):")
    cols = {n: os.path.join(PROD, f"bangle-{n}.png") for n in [
        "gold", "rose-gold", "polished-silver", "oxidised-silver", "gunmetal",
        "medallion-red", "medallion-green", "medallion-ivory"]}
    # bangle.png is the base hero (rose-gold) — treat as the default classic view too.
    allhex["bangle_colours"] = do_colourways("bangle", "classic", cols)

    print("Brooch per-finish recolours:")
    brooch_finishes()
    print("Pendant per-finish designs:")
    allhex["pendant"] = pendant_finishes()

    print("Brand marks + PWA icons:")
    brand_and_icons()

    print("\n=== SWATCH HEXES (quote these in catalog.ts) ===")
    for k, v in allhex.items():
        print(k, v)


if __name__ == "__main__":
    main()
