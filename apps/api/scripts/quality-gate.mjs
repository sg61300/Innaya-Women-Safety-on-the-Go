// Visual quality gate over every catalogue tile.
//
// Tiles carry a baked dark studio ground (no alpha), and every finish/colour of
// a given design+view MUST share the same silhouette (only the metal colour
// differs). So the robust, finish-invariant defect signal is silhouette
// agreement: rasterise each tile's foreground mask, build a per-group consensus
// mask (pixel majority across finishes), and flag any tile whose IoU with the
// consensus is low — a cut / half / fragmented / wrong-shape render. Blank tiles
// are flagged too. Off-centre / edge-touch are reported as secondary info.
//
// Caveat: designs with a very dark face (onyx, a dark medallion) yield a small
// foreground mask and can false-positive; confirm those visually. Real drops go
// in scripts/check-images.mjs's deny-list; this script is the discovery tool.
//
// Run from apps/api:  node scripts/quality-gate.mjs   (Node >= 22 strips TS.)
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { allImageRefs } from "../src/products/catalog.ts";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const T = 45;          // colour distance from background => foreground
const N = 64;          // mask resolution
const IOU_MIN = 0.72;

function d2(a, b, c, r, g, bl) { const x = a - r, y = b - g, z = c - bl; return x * x + y * y + z * z; }

async function mask(ref) {
  const abs = join(PUBLIC, ref.replace(/^\//, ""));
  const { data, info } = await sharp(abs).removeAlpha().resize(N, N, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const at = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };
  let br = 0, bg = 0, bb = 0, cnt = 0; const P = 4;
  for (const [cx, cy] of [[0, 0], [W - P, 0], [0, H - P], [W - P, H - P]])
    for (let y = cy; y < cy + P; y++) for (let x = cx; x < cx + P; x++) { const [r, g, b] = at(x, y); br += r; bg += g; bb += b; cnt++; }
  br /= cnt; bg /= cnt; bb /= cnt;
  const m = new Uint8Array(W * H); let fg = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  const th = T * T;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = at(x, y); if (d2(br, bg, bb, r, g, b) > th) { m[y * W + x] = 1; fg++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
  const cx = fg ? (x0 + x1) / 2 : W / 2, cy = fg ? (y0 + y1) / 2 : H / 2;
  // Connected-component pass (4-neighbour) over the foreground mask. A single
  // studio cut-out is ONE component, centred with a margin. A cropped
  // contact-sheet fragment shows a second object's edge (a second big
  // component) and/or a component that runs into the canvas edge. Count only
  // components >= 3 % of the area (ignore speckle); flag >1, and flag any such
  // component that touches the canvas edge.
  const AREA = W * H, MIN_COMP = 0.03 * AREA;
  const label = new Int32Array(W * H);
  const stack = [];
  const big = [];
  let lab = 0;
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || label[s]) continue;
    lab++; label[s] = lab; stack.length = 0; stack.push(s);
    let size = 0, touches = false;
    while (stack.length) {
      const p = stack.pop(); size++;
      const px = p % W, py = (p / W) | 0;
      if (px === 0 || py === 0 || px === W - 1 || py === H - 1) touches = true;
      if (px > 0 && m[p - 1] && !label[p - 1]) { label[p - 1] = lab; stack.push(p - 1); }
      if (px < W - 1 && m[p + 1] && !label[p + 1]) { label[p + 1] = lab; stack.push(p + 1); }
      if (py > 0 && m[p - W] && !label[p - W]) { label[p - W] = lab; stack.push(p - W); }
      if (py < H - 1 && m[p + W] && !label[p + W]) { label[p + W] = lab; stack.push(p + W); }
    }
    if (size >= MIN_COMP) big.push({ size, touches });
  }
  const bigCount = big.length;
  const edgeTouch = big.some((c) => c.touches);
  return { ref, m, W, H, fill: fg / (W * H), edge: fg ? (x0 <= 0 || y0 <= 0 || x1 >= W - 1 || y1 >= H - 1) : false, offX: Math.abs(cx - W / 2) / W, offY: Math.abs(cy - H / 2) / H, bigCount, edgeTouch };
}

const FINISHES = ["rose-gold", "gold", "gunmetal", "polished-silver", "oxidised-silver"];
function groupKey(ref) {
  const base = ref.split("/").pop().replace(/\.webp$/, "");
  for (const f of FINISHES) if (base.endsWith("-" + f)) return "F:" + ref.replace("/" + base + ".webp", "/" + base.slice(0, -(f.length + 1)));
  const dir = ref.slice(0, ref.lastIndexOf("/"));
  if (/classic-colour-/.test(base)) return "C:" + dir + "/classic-colour";   // bangle colours share a silhouette
  return "S:" + ref;                                                          // singletons (different views ≠ same silhouette)
}

const refs = allImageRefs();
const rows = [];
for (const ref of refs) rows.push(await mask(ref));

const groups = {};
for (const r of rows) (groups[groupKey(r.ref)] ||= []).push(r);
const consensus = {};
for (const [k, arr] of Object.entries(groups)) {
  if (arr.length < 3) continue;
  const c = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) { let s = 0; for (const r of arr) s += r.m[i]; if (s * 2 > arr.length) c[i] = 1; }
  consensus[k] = c;
}
const iou = (a, b) => { let inter = 0, uni = 0; for (let i = 0; i < a.length; i++) { const u = a[i] | b[i]; uni += u; inter += a[i] & b[i]; } return uni ? inter / uni : 1; };

const defects = [];
for (const r of rows) {
  const reasons = [];
  const k = groupKey(r.ref);
  if (r.fill < 0.02) reasons.push("blank");
  if (consensus[k]) { const v = iou(r.m, consensus[k]); if (v < IOU_MIN) reasons.push("silhouette IoU " + v.toFixed(2)); }
  // Contact-sheet fragment signals. A clean cut-out is ONE foreground component
  // on a dark studio ground, framed with a margin. A cropped contact-sheet tile
  // betrays itself as (a) more than one big component (a second object's edge),
  // (b) a near-full-bleed foreground = the studio ground is missing / it is a
  // raw grid crop, or (c) a big component running into the canvas edge — but
  // (c) alone also fires on a legitimately tight single-object crop, so it is
  // only a defect when it coincides with (a) or (b).
  if (r.bigCount > 1) reasons.push("multi-object (" + r.bigCount + " components >3%)");
  if (r.fill > 0.85) reasons.push("full-bleed / no studio ground (fill " + Math.round(r.fill * 100) + "%)");
  if (r.edgeTouch && (r.bigCount > 1 || r.fill > 0.85)) reasons.push("edge-touch fragment");
  if (reasons.length) defects.push({ ref: r.ref, reasons });
}

console.log("[quality-gate] " + refs.length + " tiles analysed, " + defects.length + " flagged (confirm visually).");
for (const d of defects) console.log("  FLAG " + d.ref + "  [" + d.reasons.join(", ") + "]");
process.exit(0);
