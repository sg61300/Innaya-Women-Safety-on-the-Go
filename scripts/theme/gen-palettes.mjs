import { readFileSync, writeFileSync } from "node:fs";
const VAULT = process.env.VAIRA_VAULT ?? ".";
const app = readFileSync(`${VAULT}/Design/figma-make/src/App.tsx`, "utf8");
const css = readFileSync(`${VAULT}/Design/figma-make/src/index.css`, "utf8");
const camel = (k) => k.replace(/^--/, "").replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
// :root defaults (Midnight)
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const defaults = {};
for (const m of root.matchAll(/(--[\w-]+):\s*([^;]+);/gs)) defaults[camel(m[1])] = m[2].replace(/\s+/g, " ").trim();
// PALETTES block
const block = app.slice(app.indexOf("const PALETTES = {"), app.indexOf("type PaletteKey"));
const out = {}; const meta = {}; const order = [];
for (const m of block.matchAll(/\n  (\w+): \{\s*label: "([^"]+)", swatch: \[([^\]]+)\],\s*vars: \{(.*?)\} as Record/gs)) {
  const [, key, label, swatch, vars] = m; const p = { ...defaults };
  for (const v of vars.matchAll(/"(--[\w-]+)":\s*"([^"]*)"/g)) p[camel(v[1])] = v[2];
  out[key] = p; meta[key] = { label, swatch: swatch.split(",").map(s => s.trim().replace(/"/g, "")) }; order.push(key);
}
if (order.length !== 8) throw new Error(`expected 8 palettes, found ${order.length}`);
writeFileSync("apps/mobile/src/theme/palettes.json", JSON.stringify({ order, meta, palettes: out }, null, 2));
console.log("[theme] wrote", order.join(", "), "tokens per palette:", Object.keys(out.violetBloom).length);
