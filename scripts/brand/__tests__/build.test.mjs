import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { build } from "../build.mjs";

test("build produces the icon set with exact sizes", async () => {
  const out = await build({ src: "Design-fixtures", allowLowres: true, dryRun: false, outDir: "apps/mobile/assets/brand" });
  for (const [name, size] of [["icon-1024.png", 1024], ["adaptive-fg.png", 1024], ["adaptive-bg.png", 1024], ["emblem.png", 512], ["notification.png", 96]]) {
    assert.ok(existsSync(`${out}/${name}`), name);
    const m = await sharp(`${out}/${name}`).metadata();
    assert.equal(m.width, size); assert.equal(m.height, size);
  }
  for (let i = 0; i < 5; i++) {
    const m = await sharp(`${out}/splash-0${i}.png`).metadata();
    assert.equal(m.width, 580); assert.equal(m.height, 580); assert.equal(m.hasAlpha, true); // emblem-only crop (splash option 1)
  }
});

test("refuses low-res masters unless --allow-lowres", async () => {
  await assert.rejects(() => build({ src: "Design-fixtures", allowLowres: false, dryRun: true, outDir: "tmp-brand" }), /below 1024/);
});

// --- Stress tests (orchestrator rulings) ---

test("missing master file rejects with a clear error naming the file", async () => {
  await assert.rejects(
    () => build({ src: "Design-fixtures-nonexistent", allowLowres: true, dryRun: true, outDir: "tmp-brand" }),
    /emblem-1024\.png/
  );
});

test("dryRun with allowLowres writes nothing", async () => {
  const { existsSync: exists, rmSync } = await import("node:fs");
  const outDir = "tmp-brand-dryrun";
  rmSync(outDir, { recursive: true, force: true });
  const out = await build({ src: "Design-fixtures", allowLowres: true, dryRun: true, outDir });
  assert.equal(exists(outDir), false, "dryRun must not create the output directory");
  assert.equal(out, outDir);
});
