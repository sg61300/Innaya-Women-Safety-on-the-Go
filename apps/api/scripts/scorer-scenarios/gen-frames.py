#!/usr/bin/env python3
"""Generate 4 tiny synthetic masked-frame JPEGs (no downloads) and write them
base64-encoded into frames.json. The visual channel is only SMOKE-TESTED with
these; the transcript/vitals/state channel is what the B7 run grades.

Frames:
  neutral-day  - grey street-like vertical gradient (benign daylight)
  dark-night   - near-black, low contrast (degraded input -> expect >=1 cue)
  close-figure - a large dark silhouette blob filling ~60% of the frame
  blank        - flat mid-grey (no information)

Run: python scripts/scorer-scenarios/gen-frames.py
"""
import base64
import io
import json
import os

from PIL import Image, ImageDraw

W = H = 256


def to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=60)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def neutral_day() -> Image.Image:
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        # light grey sky at top -> darker road at bottom
        v = int(200 - (y / H) * 90)
        for x in range(W):
            px[x, y] = (v, v, v + 4)
    d = ImageDraw.Draw(img)
    # faint road centre line
    d.line([(W // 2, H), (W // 2, int(H * 0.55))], fill=(150, 150, 150), width=3)
    return img


def dark_night() -> Image.Image:
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        v = int(10 + (y / H) * 12)  # 10..22, near-black low contrast
        for x in range(W):
            px[x, y] = (v, v, v + 2)
    return img


def close_figure() -> Image.Image:
    img = neutral_day()
    d = ImageDraw.Draw(img)
    # large dark silhouette blob filling ~60% of the frame, centred low
    d.ellipse([int(W * 0.20), int(H * 0.15), int(W * 0.80), int(H * 1.05)], fill=(18, 18, 20))
    return img


def blank() -> Image.Image:
    return Image.new("RGB", (W, H), (128, 128, 128))


def main() -> None:
    frames = {
        "neutral-day": to_b64(neutral_day()),
        "dark-night": to_b64(dark_night()),
        "close-figure": to_b64(close_figure()),
        "blank": to_b64(blank()),
    }
    out = os.path.join(os.path.dirname(__file__), "frames.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(frames, f, indent=0)
        f.write("\n")
    sizes = {k: len(v) for k, v in frames.items()}
    print("wrote", out, "b64 lengths:", sizes)


if __name__ == "__main__":
    main()
