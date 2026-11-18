# VAIRA illustration slots

Drop a `<key>.webp` into this folder, then run:

```
node scripts/illustrations-map.mjs
```

That regenerates `illustrations.generated.ts`. Any key without a file renders the
brand emblem (`assets/brand/emblem.png`) as a graceful fallback, so slots always
show something. Files should be transparent WebP, about 1024 px square,
**<= 150 KB each** (convert the 1024 px PNG renders to WebP).

## Style (match the product renders)

Soft, three-dimensional studio render. Rose-gold metal and warm plum accents on a
transparent background. Gentle top-left key light, soft contact shadow, subtle
gloss. Centered single subject, generous padding, no text, no logo, no border. The
same jewellery-catalogue look as the product cut-outs in
`apps/api/public/products/<slug>/*.webp`.

Prefix every prompt with:
> Transparent background, soft 3D studio product render, rose-gold and plum
> palette, gentle soft shadow, centered, no text, 1024x1024.

## Slots

| key (filename) | where it shows | size (px) | subject prompt |
|---|---|---|---|
| `selfdefence-hero.webp` | Self-defence hub hero | 120 | A rose-gold shield with a small heart cut-out, floating, soft 3D. |
| `tool-pepper-spray.webp` | Self-defence -> Tools card | 32 | A compact rose-gold pepper-spray canister, upright, soft 3D. |
| `tool-personal-alarm.webp` | Self-defence -> Tools card | 32 | A small rose-gold personal-alarm keyfob with a pull pin, soft 3D. |
| `tool-whistle.webp` | Self-defence -> Tools card | 32 | A rose-gold safety whistle on a plum cord, soft 3D. |
| `tool-safety-phone.webp` | Self-defence -> Tools card (default) | 32 | A rose-gold smartphone with a shield badge on screen, soft 3D. |
| `class-selfdefence.webp` | Self-defence -> Classes card | 32 | Two rose-gold silhouettes in a self-defence stance, soft 3D. |
| `class-map-pin.webp` | Classes / map marker | 32 | A rose-gold map pin with a small class icon, soft 3D. |
| `simulate-drill.webp` | Simulate -> practice drill card | 40 | A rose-gold stopwatch with a checkmark, soft 3D. |
| `simulate-golive.webp` | Simulate -> go-live card | 40 | A rose-gold broadcast/live dot with concentric rings, soft 3D. |
| `simulate-videocall.webp` | Simulate -> video-call card | 40 | A rose-gold video-camera bubble, soft 3D. |
| `regions-empty.webp` | Regions empty state | 96 | A rose-gold map with a soft plum "all clear" glow, soft 3D. |
| `journey-plan.webp` | Plan-a-journey header | 96 | A rose-gold route line between two pins, soft 3D. |
| `consent-disclaimer.webp` | Sign-up disclaimer pop-up | 88 | A rose-gold document with a shield seal, soft 3D. |
| `guardians.webp` | Profile -> Guardians | 72 | Three rose-gold silhouettes in a protective ring, soft 3D. |
| `vitals.webp` | Profile -> Vitals | 72 | A rose-gold heart with a pulse line, soft 3D. |

Keys are declared in `src/components/Illustration.tsx` (`IllustrationName`). Add a
new key there and to this table before referencing it in a screen.
