// B7 scorer scenario runner (R45, ADR-022 / ADR-032).
//
// Runs the live free danger-scorer providers over the labelled scenario set and
// produces the accuracy / latency / failure table that decides which providers
// stay admitted and whether the 2 s AMBER cadence is realistic.
//
// Design (ban-safe + faithful):
//  - Providers are called SERIALLY, one at a time, with a >=1 s gap. 429 backs
//    off 10 s, up to 3 retries. Total calls are capped (see CAP note below).
//  - Each provider request mirrors the PRODUCTION adapter (apps/api/src/lib/
//    providers/*): same endpoint, same body, and the REAL production parser
//    `parseDanger` + `SYSTEM` + `userText` + `frame` from shared.ts. The only
//    reason we inline the fetch (instead of importing mistral.ts/groq.ts) is
//    that those files use extensionless relative imports that bare Node ESM
//    cannot resolve; shared.ts (type-only external import) DOES load, so the
//    load-bearing parser and prompt are the real ones.
//  - The ensemble/fusion is the REAL production `runEnsemble` (packages/core/
//    src/scorer/ensemble.ts), driven by stub voters that replay the cached live
//    result of each provider. No extra API calls, exact production fusion + the
//    state-gated voter set (SAFE: mistral+groq; AMBER+: +gemini) + rules-only
//    floor. This is what /api/analyze calls.
//
// Keys: read from apps/api/.env.local. NEVER printed, logged or written to any
// output file. results.json contains danger/reasons/latency/outcome only.
//
// Run: pnpm --filter api exec node scripts/scorer-scenarios/run.mjs
//      (optional: SCORER_RUN_DELAY_MS, SCORER_RUN_TIMEOUT_MS overrides)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(HERE, "..", "..");
const CORE_ROOT = join(API_ROOT, "..", "..", "packages", "core");
const asUrl = (p) => pathToFileURL(p).href;

// Real production parser + prompt (the code path under test).
const { SYSTEM, userText, frame, parseDanger, AUDIO_NOTE } = await import(
  asUrl(join(API_ROOT, "src", "lib", "providers", "shared.ts"))
);
// Real production ensemble/fusion.
const { runEnsemble } = await import(
  asUrl(join(CORE_ROOT, "src", "scorer", "ensemble.ts"))
);

const DELAY_MS = Number(process.env.SCORER_RUN_DELAY_MS ?? 1200); // >= 1 s gap
const CALL_TIMEOUT_MS = Number(process.env.SCORER_RUN_TIMEOUT_MS ?? 30_000); // measure real latency
const MAX_RETRIES = 3;
const BACKOFF_429_MS = 10_000;
const REPEAT_IDS = ["quiet-commute", "being-followed", "explicit-threat-en", "coercion-calm", "silence-elevated-hr"]; // 5 for latency variance

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- env (never logged) -----------------------------------------------------
function loadEnv() {
  const raw = readFileSync(join(API_ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

// ---- provider selection (mirrors providers/index.ts buildScorers + groq.resolveLlamaRoute) ----
function resolveLlamaRoute(env) {
  if (env.GROQ_API_KEY)
    // Audio-channel voter: Groq has no vision model, so no image is sent (omitImage). Mirrors groq.ts.
    return { via: "groq", url: "https://api.groq.com/openai/v1/chat/completions", apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL ?? "qwen/qwen3.8-27b", omitImage: true };
  if (env.OPENROUTER_API_KEY) {
    const primary = env.OPENROUTER_LLAMA_MODEL ?? "minimax/minimax-m3:free"; // mirrors groq.ts default
    const fallbackModels = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"].filter((m) => m !== primary);
    return { via: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", apiKey: env.OPENROUTER_API_KEY, model: primary, fallbackModels, extraHeaders: { "HTTP-Referer": env.APP_BASE_URL ?? "https://vaira.app", "X-Title": "VAIRA" } };
  }
  if (env.SAMBANOVA_API_KEY)
    return { via: "sambanova", url: "https://api.sambanova.ai/v1/chat/completions", apiKey: env.SAMBANOVA_API_KEY, model: env.SAMBANOVA_LLAMA_MODEL ?? "Llama-4-Scout-17B-16E-Instruct" };
  return null;
}

function admittedProviders(env) {
  const list = [];
  if (env.MISTRAL_API_KEY)
    list.push({ id: "mistral-small-vision", kind: "openai", via: "mistral", url: "https://api.mistral.ai/v1/chat/completions", apiKey: env.MISTRAL_API_KEY, model: env.MISTRAL_MODEL ?? "ministral-14b-latest" });
  const llama = resolveLlamaRoute(env);
  if (llama) list.push({ id: "groq-llama4-scout", kind: "openai", ...llama });
  if (env.GEMINI_API_KEY)
    list.push({ id: "gemini-flash-free", kind: "gemini", via: "gemini", url: null, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL ?? "gemini-3.5-flash" });
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID)
    // Vision voter (Q3): mirrors cloudflare.ts — image as a byte array, JSON reply.
    list.push({ id: "cloudflare-llama-vision", kind: "cloudflare", via: "cloudflare", accountId: env.CLOUDFLARE_ACCOUNT_ID, apiKey: env.CLOUDFLARE_API_TOKEN, model: env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.2-11b-vision-instruct" });
  if (env.CLAUDE_FALLBACK === "on" && env.ANTHROPIC_API_KEY)
    list.push({ id: "claude-haiku-4-5", kind: "claude", via: "anthropic", apiKey: env.ANTHROPIC_API_KEY, model: "claude-haiku-4-5" });
  return list;
}

// ---- one live call, classified -------------------------------------------------
// outcome in {ok, refusal, malformed_json, timeout, http_error, rate_limited, unavailable}
function scoreInputOf(sc, frames) {
  return {
    maskedFrameB64: frames[sc.frame],
    transcript30s: sc.transcript,
    vitals: sc.hr ?? undefined,
    state: sc.state,
    plateText: sc.plateText ?? undefined,
  };
}

function classifyRefusal(text) {
  return /\b(i\s*(?:can'?t|cannot|am\s+unable|won'?t)|as an ai|i'?m sorry|i am sorry|unable to (?:assist|help|comply))\b/i.test(text);
}

async function callOpenAIModel(p, model, input, signal) {
  // Audio-channel voter (Groq): transcript only, no image. Mirrors shared.ts openaiVisionScore.
  const userContent = p.omitImage
    ? userText(input) + AUDIO_NOTE
    : [{ type: "text", text: userText(input) }, { type: "image_url", image_url: { url: frame(input).dataUrl } }];
  const res = await fetch(p.url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}`, ...(p.extraHeaders ?? {}) },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 256,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) return { httpStatus: res.status, bodyText, model };
  let json;
  try { json = JSON.parse(bodyText); } catch { return { httpStatus: 200, bodyText, content: bodyText, model }; }
  const content = json?.choices?.[0]?.message?.content ?? "";
  return { httpStatus: 200, content: typeof content === "string" ? content : JSON.stringify(content), model };
}

// Mirrors groq.ts: try the primary slug, then fallbackModels ONLY on 404/410
// (retired slug), never on 429/5xx.
async function callOpenAI(p, input, signal) {
  const models = [p.model, ...(p.fallbackModels ?? [])];
  let last;
  for (const model of models) {
    last = await callOpenAIModel(p, model, input, signal);
    if (last.httpStatus === 404 || last.httpStatus === 410) continue;
    return last;
  }
  return last;
}

async function callGemini(p, input, signal) {
  const { b64 } = frame(input);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": p.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: userText(input) }, { inlineData: { mimeType: "image/jpeg", data: b64 } }] }],
      // thinkingBudget:0 mirrors the production gemini.ts fix (P1): keep the whole
      // token budget for the JSON answer instead of hidden thinking (MAX_TOKENS).
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 256, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) return { httpStatus: res.status, bodyText };
  let json;
  try { json = JSON.parse(bodyText); } catch { return { httpStatus: 200, bodyText, content: bodyText }; }
  const cand = json?.candidates?.[0];
  const content = cand?.content?.parts?.[0]?.text ?? "";
  // Empty text => truncated/blocked; carry the finishReason so the row shows why.
  return { httpStatus: 200, content, finishReason: cand?.finishReason };
}

async function callCloudflare(p, input, signal) {
  const { b64 } = frame(input);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${p.accountId}/ai/run/${p.model}`, {
    method: "POST",
    signal,
    headers: { authorization: `Bearer ${p.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: userText(input) }],
      image: Array.from(Buffer.from(b64, "base64")),
      max_tokens: 256,
    }),
  });
  const bodyText = await res.text();
  if (!res.ok) return { httpStatus: res.status, bodyText };
  let json;
  try { json = JSON.parse(bodyText); } catch { return { httpStatus: 200, bodyText, content: bodyText }; }
  if (json?.success === false) return { httpStatus: 200, content: "" }; // app-level error -> malformed_json
  const response = json?.result?.response;
  return { httpStatus: 200, content: typeof response === "string" ? response : JSON.stringify(response ?? "") };
}

async function liveCallOnce(p, input) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const r = p.kind === "gemini" ? await callGemini(p, input, ctrl.signal)
      : p.kind === "cloudflare" ? await callCloudflare(p, input, ctrl.signal)
      : await callOpenAI(p, input, ctrl.signal);
    const latencyMs = Date.now() - t0;
    if (r.httpStatus === 429) return { outcome: "rate_limited", latencyMs, httpStatus: 429 };
    if (r.httpStatus === 401 || r.httpStatus === 403) return { outcome: "unavailable", latencyMs, httpStatus: r.httpStatus };
    if (r.httpStatus && r.httpStatus >= 400) return { outcome: "http_error", latencyMs, httpStatus: r.httpStatus };
    const text = r.content ?? "";
    try {
      const { danger, reasons } = parseDanger(text); // REAL production parser
      return { outcome: "ok", danger, reasons, latencyMs, httpStatus: 200, model: r.model };
    } catch {
      if (!text || classifyRefusal(text)) return { outcome: text ? "refusal" : "malformed_json", latencyMs, httpStatus: 200, finishReason: r.finishReason, model: r.model };
      return { outcome: "malformed_json", latencyMs, httpStatus: 200, finishReason: r.finishReason, model: r.model };
    }
  } catch (e) {
    const latencyMs = Date.now() - t0;
    if (e?.name === "AbortError") return { outcome: "timeout", latencyMs };
    return { outcome: "http_error", latencyMs, netError: String(e?.message ?? e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

async function liveCall(p, input, label) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const r = await liveCallOnce(p, input);
    if (r.outcome === "rate_limited" && attempt < MAX_RETRIES) {
      process.stderr.write(`  [429] ${p.id} ${label} backoff ${BACKOFF_429_MS}ms (retry ${attempt + 1})\n`);
      await sleep(BACKOFF_429_MS);
      continue;
    }
    // Transient server overload (503/502/500): short retry so we fairly sample a
    // provider that is up but momentarily busy. Still counts as http_error if it
    // never recovers.
    if (r.outcome === "http_error" && [500, 502, 503].includes(r.httpStatus) && attempt < MAX_RETRIES) {
      process.stderr.write(`  [${r.httpStatus}] ${p.id} ${label} transient, retry ${attempt + 1} in 3s\n`);
      await sleep(3000);
      continue;
    }
    return r;
  }
  return { outcome: "rate_limited", latencyMs: 0 };
}

// ---- production fusion via real runEnsemble over cached results -----------------
function stubBudget() { return { canCall: () => true, record() {}, backoff() {} }; }
function stubScorer(id, cached) {
  return {
    id,
    async score() {
      if (cached && cached.outcome === "ok") return { provider: id, danger: cached.danger, reasons: cached.reasons, latencyMs: cached.latencyMs };
      const st = cached?.httpStatus ?? (cached?.outcome === "timeout" ? "timeout" : "err");
      throw Object.assign(new Error(cached?.outcome ?? "missing"), { status: st });
    },
  };
}

// ---- metrics -------------------------------------------------------------------
function pct(n, d) { return d ? Math.round((n / d) * 1000) / 10 : 0; }
function percentile(sorted, q) {
  if (!sorted.length) return null;
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}
function langOf(id) { return id.includes("-hi-") ? "HI" : id.includes("-kn-") ? "KN" : "EN"; }

function summarise(rows, scById) {
  // rows: [{ id, outcome, danger?, reasons?, latencyMs }]
  const n = rows.length;
  const ok = rows.filter((r) => r.outcome === "ok");
  const okLat = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
  const count = (o) => rows.filter((r) => r.outcome === o).length;
  let exact = 0, within = 0, over = 0, under = 0;
  const misses = [];
  for (const r of ok) {
    const sc = scById[r.id];
    const tol = sc.tolerance;
    if (r.danger === sc.expected) exact++;
    if (Math.abs(r.danger - sc.expected) <= tol) within++;
    if (r.danger > sc.expected + tol) over++;
    if (r.danger < sc.expected - tol) {
      under++;
      if (sc.expected === 3) misses.push({ id: r.id, title: sc.title, expected: sc.expected, got: r.danger, reasons: r.reasons });
    }
  }
  return {
    n, ok: ok.length,
    exactPct: pct(exact, ok.length), withinPct: pct(within, ok.length),
    over, under, misses,
    p50: percentile(okLat, 0.5), p95: percentile(okLat, 0.95),
    refusalPct: pct(count("refusal"), n), malformedPct: pct(count("malformed_json"), n),
    errors: { http_error: count("http_error"), timeout: count("timeout"), rate_limited: count("rate_limited"), unavailable: count("unavailable") },
  };
}

function summariseByLang(rows, scById) {
  const out = {};
  for (const L of ["EN", "HI", "KN"]) {
    const sub = rows.filter((r) => langOf(r.id) === L);
    out[L] = sub.length ? summarise(sub, scById) : null;
  }
  return out;
}

// ---- main ----------------------------------------------------------------------
const env = loadEnv();
const frames = JSON.parse(readFileSync(join(HERE, "frames.json"), "utf8"));
let { scenarios } = JSON.parse(readFileSync(join(HERE, "scenarios.json"), "utf8"));
// Smoke-test limiters (do NOT use for the graded run): SCORER_LIMIT caps scenario
// count, SCORER_ONLY restricts to one provider id. Full graded run sets neither.
if (process.env.SCORER_LIMIT) scenarios = scenarios.slice(0, Number(process.env.SCORER_LIMIT));
const scById = Object.fromEntries(scenarios.map((s) => [s.id, s]));
let providers = admittedProviders(env);
if (process.env.SCORER_ONLY) providers = providers.filter((p) => p.id === process.env.SCORER_ONLY);

process.stderr.write(`Admitted providers: ${providers.map((p) => `${p.id}(${p.via})`).join(", ") || "NONE"}\n`);
process.stderr.write(`Scenarios: ${scenarios.length}; delay ${DELAY_MS}ms; call timeout ${CALL_TIMEOUT_MS}ms\n`);

// per-provider primary run (serial)
const perProvider = {}; // id -> rows[]
const rawCalls = [];    // flat log (no keys)
const HARD_FAIL = new Set(["rate_limited", "unavailable", "http_error", "timeout"]);
const BREAKER_AFTER = 3; // stop hammering a provider after this many consecutive hard failures
for (const p of providers) {
  const rows = [];
  let consec = 0, tripped = false, lastFail = "http_error";
  for (const sc of scenarios) {
    if (tripped) {
      rows.push({ id: sc.id, outcome: lastFail, latencyMs: 0, skipped: true });
      rawCalls.push({ provider: p.id, scenario: sc.id, expected: sc.expected, tolerance: sc.tolerance, state: sc.state, lang: langOf(sc.id), outcome: lastFail, danger: null, reasons: null, latencyMs: 0, httpStatus: null, skipped: true });
      continue;
    }
    const input = scoreInputOf(sc, frames);
    const r = await liveCall(p, input, sc.id);
    if (HARD_FAIL.has(r.outcome)) { consec++; lastFail = r.outcome; if (consec >= BREAKER_AFTER) { tripped = true; process.stderr.write(`  [breaker] ${p.id}: ${consec} consecutive ${lastFail}; skipping remaining scenarios\n`); } }
    else consec = 0;
    rows.push({ id: sc.id, ...r });
    rawCalls.push({ provider: p.id, scenario: sc.id, expected: sc.expected, tolerance: sc.tolerance, state: sc.state, lang: langOf(sc.id), outcome: r.outcome, danger: r.danger ?? null, reasons: r.reasons ?? null, latencyMs: r.latencyMs, httpStatus: r.httpStatus ?? null });
    process.stderr.write(`  ${p.id} ${sc.id}: ${r.outcome}${r.outcome === "ok" ? ` d=${r.danger} exp=${sc.expected}(±${sc.tolerance})` : ""} ${r.latencyMs}ms\n`);
    await sleep(DELAY_MS);
  }
  perProvider[p.id] = rows;
}

// latency-variance repeat (5 scenarios x each provider, 2nd sample)
const repeatSamples = {}; // id -> [{scenario, latencyMs, outcome}]
for (const p of providers) {
  repeatSamples[p.id] = [];
  const hadOk = perProvider[p.id].some((r) => r.outcome === "ok");
  if (!hadOk) { process.stderr.write(`  [repeat] ${p.id}: no primary success, skipping latency repeat\n`); continue; }
  for (const id of REPEAT_IDS) {
    const sc = scById[id];
    if (!sc) continue;
    const r = await liveCall(p, scoreInputOf(sc, frames), `${id}#2`);
    repeatSamples[p.id].push({ scenario: id, latencyMs: r.latencyMs, outcome: r.outcome });
    process.stderr.write(`  [repeat] ${p.id} ${id}: ${r.outcome} ${r.latencyMs}ms\n`);
    await sleep(DELAY_MS);
  }
}

// ensemble via REAL runEnsemble over cached per-scenario results
const ensembleRows = [];
for (const sc of scenarios) {
  const cachedById = {};
  for (const p of providers) cachedById[p.id] = perProvider[p.id].find((r) => r.id === sc.id);
  const stubs = providers.map((p) => stubScorer(p.id, cachedById[p.id]));
  const outcome = await runEnsemble(scoreInputOf(sc, frames), { scorers: stubs, budget: stubBudget(), claudeFallback: false, timeoutMs: 30_000 });
  const fusedLatency = outcome.votes.length ? Math.max(...outcome.votes.map((v) => v.latencyMs)) : null;
  ensembleRows.push({ id: sc.id, outcome: outcome.votes.length ? "ok" : "malformed_json", danger: outcome.danger, reasons: [...new Set(outcome.votes.flatMap((v) => v.reasons))], latencyMs: fusedLatency ?? 0, voters: outcome.votes.map((v) => v.provider), fallbacks: outcome.fallbacks, rulesOnly: outcome.rulesOnly });
}

// build summaries
const providerSummaries = {};
for (const p of providers) providerSummaries[p.id] = { overall: summarise(perProvider[p.id], scById), byLang: summariseByLang(perProvider[p.id], scById), via: p.via, model: p.model };
const ensembleSummary = { overall: summarise(ensembleRows, scById), byLang: summariseByLang(ensembleRows, scById) };

// latency incl. repeat, per provider (combine primary ok + repeat ok)
const latencyStats = {};
for (const p of providers) {
  const primary = perProvider[p.id].filter((r) => r.outcome === "ok").map((r) => r.latencyMs);
  const repeat = repeatSamples[p.id].filter((r) => r.outcome === "ok").map((r) => r.latencyMs);
  const all = [...primary, ...repeat].sort((a, b) => a - b);
  latencyStats[p.id] = { samples: all.length, p50: percentile(all, 0.5), p95: percentile(all, 0.95), max: all.length ? all[all.length - 1] : null };
}
const ensLat = ensembleRows.filter((r) => r.latencyMs).map((r) => r.latencyMs).sort((a, b) => a - b);
latencyStats["ensemble"] = { samples: ensLat.length, p50: percentile(ensLat, 0.5), p95: percentile(ensLat, 0.95), max: ensLat.length ? ensLat[ensLat.length - 1] : null };

const results = {
  generatedAt: new Date().toISOString(),
  note: "No keys or PII. Frames are synthetic; visual channel is smoke-test only.",
  admitted: providers.map((p) => ({ id: p.id, via: p.via, model: p.model })),
  config: { delayMs: DELAY_MS, callTimeoutMs: CALL_TIMEOUT_MS, repeatIds: REPEAT_IDS },
  providerSummaries, ensembleSummary, latencyStats,
  ensembleRows, rawCalls,
};
// SCORER_OUT_SUFFIX="-run2" writes results-run2.{json,md} (lane F re-run), leaving
// the original B7 results.* intact for comparison.
const SUFFIX = process.env.SCORER_OUT_SUFFIX ?? "";
writeFileSync(join(HERE, `results${SUFFIX}.json`), JSON.stringify(results, null, 2) + "\n");
writeFileSync(join(HERE, `results${SUFFIX}.md`), renderMarkdown(results));
process.stderr.write(`\nWrote results${SUFFIX}.json and results${SUFFIX}.md\n`);

// ---- markdown ------------------------------------------------------------------
function fmt(v) { return v == null ? "—" : String(v); }
function row(cells) { return `| ${cells.join(" | ")} |`; }
function renderMarkdown(res) {
  const L = [];
  L.push(`# B7 scorer scenario results`);
  L.push(``, `Generated: ${res.generatedAt}. Scenarios: ${scenarios.length}. Admitted: ${res.admitted.map((a) => `\`${a.id}\` (${a.via}, ${a.model})`).join(", ")}.`);
  L.push(``, `Frames are synthetic (smoke-test only); the transcript/vitals/state channel is graded. Latency in ms.`);

  L.push(``, `## Per-provider (all ${scenarios.length} scenarios)`, ``);
  L.push(row(["provider", "n", "ok", "exact%", "within-tol%", "over-esc", "under-esc", "p50", "p95", "refusal%", "malformed%", "http_err", "timeout", "429", "unavail"]));
  L.push(row(new Array(15).fill("---")));
  for (const [id, s] of Object.entries(res.providerSummaries)) {
    const o = s.overall;
    L.push(row([`\`${id}\``, o.n, o.ok, o.exactPct, o.withinPct, o.over, o.under, fmt(o.p50), fmt(o.p95), o.refusalPct, o.malformedPct, o.errors.http_error, o.errors.timeout, o.errors.rate_limited, o.errors.unavailable]));
  }
  const eo = res.ensembleSummary.overall;
  L.push(row(["**ensemble**", eo.n, eo.ok, eo.exactPct, eo.withinPct, eo.over, eo.under, fmt(eo.p50), fmt(eo.p95), eo.refusalPct, eo.malformedPct, eo.errors.http_error, eo.errors.timeout, eo.errors.rate_limited, eo.errors.unavailable]));

  L.push(``, `## Per-language (exact% / within-tol% / n)`, ``);
  L.push(row(["provider", "EN", "HI", "KN"]));
  L.push(row(["---", "---", "---", "---"]));
  const cell = (x) => (x ? `${x.exactPct}/${x.withinPct}/${x.n}` : "—");
  for (const [id, s] of Object.entries(res.providerSummaries)) L.push(row([`\`${id}\``, cell(s.byLang.EN), cell(s.byLang.HI), cell(s.byLang.KN)]));
  L.push(row(["**ensemble**", cell(res.ensembleSummary.byLang.EN), cell(res.ensembleSummary.byLang.HI), cell(res.ensembleSummary.byLang.KN)]));

  L.push(``, `## Latency (ms, primary ok + repeat samples)`, ``);
  L.push(row(["target", "samples", "p50", "p95", "max"]));
  L.push(row(["---", "---", "---", "---", "---"]));
  for (const [id, s] of Object.entries(res.latencyStats)) L.push(row([`\`${id}\``, s.samples, fmt(s.p50), fmt(s.p95), fmt(s.max)]));

  L.push(``, `## Misses (under-escalation on expected=3)`, ``);
  const allMisses = [];
  for (const [id, s] of Object.entries(res.providerSummaries)) for (const m of s.overall.misses) allMisses.push({ provider: id, ...m });
  for (const m of res.ensembleSummary.overall.misses) allMisses.push({ provider: "ensemble", ...m });
  if (!allMisses.length) L.push(`None. No expected-3 case was under-escalated by any provider or the ensemble.`);
  else { L.push(row(["provider", "scenario", "expected", "got", "reasons"])); L.push(row(["---", "---", "---", "---", "---"])); for (const m of allMisses) L.push(row([`\`${m.provider}\``, m.id, m.expected, m.got, (m.reasons || []).join(", ")])); }

  L.push(``, `## Ensemble per scenario`, ``);
  L.push(row(["scenario", "state", "expected", "±tol", "fused", "voters", "reasons", "fallbacks", "rulesOnly"]));
  L.push(row(new Array(9).fill("---")));
  for (const r of res.ensembleRows) { const sc = scById[r.id]; L.push(row([r.id, sc.state, sc.expected, sc.tolerance, r.danger, r.voters.join("+") || "—", (r.reasons || []).join(",").slice(0, 60), (r.fallbacks || []).join(",") || "—", r.rulesOnly])); }
  return L.join("\n") + "\n";
}
