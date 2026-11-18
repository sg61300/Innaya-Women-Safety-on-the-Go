import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FILES = { emblem: "emblem-1024.png", lockup: "lockup-1024.png", splash: [0, 1, 2, 3, 4].map(i => `splash-0${i}.png`) };
const BG = "#1A0D2E";
// Crop boxes on the 1024 px masters: emblem circle on the square frames; wordmark + tagline on the 1024x1280 lockup.
const EMBLEM_BOX = { left: 222, top: 80, width: 580, height: 580 };
const WORDMARK_BOX = { left: 60, top: 810, width: 905, height: 280 };

async function square(input, size, { pad = 0 } = {}) {
  // fit inside (size - 2*pad), center on a transparent square canvas
  const inner = size - 2 * pad;
  const buf = await sharp(input).ensureAlpha().resize(inner, inner, { fit: "inside", withoutEnlargement: false }).toBuffer();
  const m = await sharp(buf).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: buf, left: Math.round((size - m.width) / 2), top: Math.round((size - m.height) / 2) }]).png();
}

async function checkRes(file, min) {
  const m = await sharp(file).metadata();
  const short = Math.min(m.width, m.height);
  return { ok: short >= min, short, hasAlpha: m.hasAlpha === true };
}

export async function build({ src, outDir, allowLowres = false, dryRun = false }) {
  const paths = { emblem: path.join(src, FILES.emblem), lockup: path.join(src, FILES.lockup), splash: FILES.splash.map(f => path.join(src, f)) };
  const checks = [["emblem", paths.emblem, 1024], ["lockup", paths.lockup, 600], ...paths.splash.map((p, i) => [`splash-0${i}`, p, 600])];
  for (const [name, file, min] of checks) {
    const r = await checkRes(file, min);
    if (!r.hasAlpha) console.warn(`[brand] WARNING ${name} has no alpha channel`);
    if (!r.ok) {
      const msg = `[brand] ${name} is ${r.short}px, below ${min}px minimum`;
      if (!allowLowres) throw new Error(msg + " (pass --allow-lowres to continue with a placeholder)");
      console.warn("WARNING " + msg + " — building placeholder output");
    }
  }
  if (dryRun) return outDir;
  await mkdir(outDir, { recursive: true });
  await (await square(paths.emblem, 1024)).toFile(path.join(outDir, "icon-1024.png"));
  await (await square(paths.emblem, 1024, { pad: 174 })).toFile(path.join(outDir, "adaptive-fg.png")); // 66 % safe zone
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).png().toFile(path.join(outDir, "adaptive-bg.png"));
  await (await square(paths.emblem, 512)).toFile(path.join(outDir, "emblem.png"));
  await sharp(paths.lockup).ensureAlpha().resize({ width: 1024, withoutEnlargement: false }).png().toFile(path.join(outDir, "lockup.png"));
  // Splash option 1 (founder, 2026-09-05 s12): the animation frames are emblem-only crops and
  // the second beat is a wordmark + tagline crop, so the two never repeat each other on screen.
  // Boxes measured on the 1024 px masters (see EMBLEM_BOX / WORDMARK_BOX).
  for (let i = 0; i < 5; i++) {
    const sq = await (await square(paths.splash[i], 1024)).toBuffer();
    await sharp(sq).extract(EMBLEM_BOX).png().toFile(path.join(outDir, `splash-0${i}.png`));
  }
  const lk = await sharp(paths.lockup).ensureAlpha().resize({ width: 1024, withoutEnlargement: false }).png().toBuffer();
  const lm = await sharp(lk).metadata();
  if (lm.height >= WORDMARK_BOX.top + WORDMARK_BOX.height) {
    await sharp(lk).extract(WORDMARK_BOX).png().toFile(path.join(outDir, "wordmark.png"));
  } else {
    console.warn(`[brand] WARNING lockup is ${lm.width}x${lm.height}; wordmark.png not regenerated (needs the 1024x1280 master)`);
  }
  // notification icon: white silhouette from the emblem alpha
  const alpha = await sharp(paths.emblem).ensureAlpha().resize(96, 96, { fit: "inside" }).extractChannel("alpha").toBuffer();
  const am = await sharp(alpha).metadata();
  const white = await sharp({ create: { width: am.width, height: am.height, channels: 3, background: "#FFFFFF" } }).joinChannel(alpha).png().toBuffer();
  await (await square(white, 96)).toFile(path.join(outDir, "notification.png"));
  return outDir;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const src = args.find(a => a.startsWith("--src="))?.slice(6) ?? "./assets/brand";
  build({ src, outDir: "apps/mobile/assets/brand", allowLowres: args.includes("--allow-lowres") })
    .then(o => console.log("[brand] wrote", o)).catch(e => { console.error(e.message); process.exit(1); });
}
