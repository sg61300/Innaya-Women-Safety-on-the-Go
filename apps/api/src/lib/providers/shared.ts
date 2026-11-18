import type { Danger, ScoreInput } from "@vaira/core";

// Kept in sync with the SYSTEM rubric in the SDD (Task 11). Each free voter returns
// ONLY JSON: {"danger":0-3,"reasons":[...]}. `danger` mirrors the DangerScore rubric.
export const SYSTEM = `You are the danger scorer for a personal-safety app used by a woman travelling alone in India. Inputs: one recent chest-height camera frame (privacy-masked), the last 30 s of ambient transcript, an optional heart-rate summary, and the app state. Return ONLY JSON: {"danger":0-3,"reasons":[...]}.
Rubric: danger 3 if any of: weapon, physical aggression against the user, user restrained. 2 if: unwanted physical contact, threatening speech, user visibly distressed, being followed with intent cues. 1 if: any single weak cue, or inputs degraded (dark, blurred, missing). 0 only if all inputs are present and benign. When uncertain choose the HIGHER danger. Never score third parties for anything other than danger to the user. reasons must be drawn from: physical_aggression, unwanted_contact, weapon, threatening_speech, vulgar_speech, user_distress_voice, user_distress_face, being_followed, isolated_location, vehicle_deviation, vitals_stress, safety_word, no_signal, model_unavailable, none.`;

export function userText(i: ScoreInput): string {
  return JSON.stringify({
    transcript_30s: i.transcript30s,
    vitals: i.vitals ?? null,
    state: i.state,
    plate: i.plateText ?? null,
  });
}

// Appended to the user text for the audio-channel (text-only) voter so it does not
// hallucinate visual reasons when it receives no camera frame (ADR-032 amendment,
// lane F: the Groq route has no vision-capable model).
export const AUDIO_NOTE =
  " (NOTE: no camera frame is available to this voter; score from the transcript, vitals and state only, and do not report visual-only reasons such as weapon or user_distress_face unless they are stated in the transcript.)";

// Accepts a bare base64 string or a data: URL and returns both forms.
export function frame(i: ScoreInput): { b64: string; dataUrl: string } {
  const b64 = i.maskedFrameB64.replace(/^data:[^,]+,/, "");
  return { b64, dataUrl: `data:image/jpeg;base64,${b64}` };
}

export function clampDanger(n: unknown): Danger {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return 0;
  return (v > 3 ? 3 : v) as Danger;
}

// D3 (R45, lane F3): the closed reason vocabulary in the SYSTEM rubric. Models
// routinely emit strings outside it ("dark", "state_AMBER", "physical_aggression_
// against_user"), which used to be stored verbatim in events.model_reasons. Kept
// in sync with the `reasons must be drawn from:` list in SYSTEM (above).
export const REASONS = [
  "physical_aggression", "unwanted_contact", "weapon", "threatening_speech", "vulgar_speech",
  "user_distress_voice", "user_distress_face", "being_followed", "isolated_location",
  "vehicle_deviation", "vitals_stress", "safety_word", "no_signal", "model_unavailable", "none",
] as const;
const REASON_SET = new Set<string>(REASONS);

// Known out-of-enum strings models emit, mapped to the closest enum member.
// Observed in the R45 live run plus obvious verbose/variant forms; anything not
// here and not in the enum is dropped (e.g. an echoed "state_AMBER").
const REASON_SYNONYMS: Record<string, string> = {
  physical_aggression_against_user: "physical_aggression",
  physical_aggression_against_the_user: "physical_aggression",
  aggression: "physical_aggression",
  user_restrained: "physical_aggression",
  restrained: "physical_aggression",
  unwanted_physical_contact: "unwanted_contact",
  unwanted_touching: "unwanted_contact",
  dark: "no_signal",
  darkness: "no_signal",
  low_light: "no_signal",
  blurred: "no_signal",
  blurry: "no_signal",
  degraded_input: "no_signal",
  poor_visibility: "no_signal",
  no_input: "no_signal",
  missing_input: "no_signal",
  followed: "being_followed",
  threat: "threatening_speech",
  threatening: "threatening_speech",
  vulgar: "vulgar_speech",
  profanity: "vulgar_speech",
  user_distress: "user_distress_voice",
  distress: "user_distress_voice",
};

const normReason = (r: string) => r.trim().toLowerCase().replace(/[\s-]+/g, "_");

// Clamp a raw model reason list to the REASONS enum: map known synonyms, drop
// unknowns, dedupe. Returns [] when nothing survives (caller defaults to ["none"]).
export function clampReasons(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const n = normReason(String(r));
    const mapped = REASON_SET.has(n) ? n : REASON_SYNONYMS[n];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

// Pulls the first JSON object out of a model text response and maps it to
// { danger, reasons }. Throws on unparseable output so the ensemble treats the
// provider as failed rather than silently scoring 0. Reasons are clamped to the
// REASONS enum (D3) so out-of-enum strings never reach events.model_reasons.
export function parseDanger(text: string): { danger: Danger; reasons: string[] } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw Object.assign(new Error("no json in model output"), { status: "parse" });
  const obj = JSON.parse(match[0]);
  const raw = obj.danger ?? obj.score;
  const rawReasons: string[] = Array.isArray(obj.reasons) ? obj.reasons.map(String) : [];
  const reasons = clampReasons(rawReasons);
  // D3: surface the raw list once (debug only) when the clamp changed anything, so
  // the out-of-enum strings a model emits stay traceable without polluting events.
  if (rawReasons.some((r) => !REASON_SET.has(normReason(r))))
    console.debug("[scorer] reasons clamped", JSON.stringify({ raw: rawReasons, clamped: reasons }));
  return { danger: clampDanger(raw), reasons: reasons.length ? reasons : ["none"] };
}

export async function readError(res: Response): Promise<never> {
  let body = "";
  try {
    body = (await res.text()).slice(0, 300);
  } catch {
    /* ignore */
  }
  throw Object.assign(new Error(`http ${res.status}: ${body}`), { status: res.status });
}

// OpenAI-compatible /chat/completions call with a single image part. Used by the
// Mistral and Groq/OpenRouter/SambaNova (Llama-4-Scout) voters.
export async function openaiVisionScore(opts: {
  url: string;
  apiKey: string;
  model: string;
  input: ScoreInput;
  signal: AbortSignal;
  extraHeaders?: Record<string, string>;
  // Audio-channel voter (Groq route): send transcript/vitals/state only, no image,
  // because the model is not vision-capable (ADR-032 amendment, lane F).
  omitImage?: boolean;
}): Promise<{ danger: Danger; reasons: string[] }> {
  const userContent = opts.omitImage
    ? userText(opts.input) + AUDIO_NOTE
    : [
        { type: "text", text: userText(opts.input) },
        { type: "image_url", image_url: { url: frame(opts.input).dataUrl } },
      ];
  const res = await fetch(opts.url, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${opts.apiKey}`,
      ...(opts.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      max_tokens: 256,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) await readError(res);
  const json: any = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  return parseDanger(typeof text === "string" ? text : JSON.stringify(text));
}
