import type { ScoreInput, ScoreResult, Scorer } from "@vaira/core";
import { SYSTEM, frame, parseDanger, readError, userText } from "./shared";

// Gemini Flash free tier via generateContent (native REST, no SDK).
export function geminiScorer(apiKey: string): Scorer {
  // Q1 (lane F2, 2026-09-06): probed lane F's 4 candidates with the thinkingBudget:0
  // fix, spaced ≥60 s (frame + transcript). Only gemini-3.5-flash returned valid JSON
  // (200 OK, danger parsed, vision accepted, thinkingConfig accepted); gemini-2.5-flash
  // and gemini-2.5-flash-lite are 404 "no longer available to new users", and
  // gemini-3.5-flash-lite 400s (invalid argument) on this request shape. gemini-3.8-flash
  // (lane F's default) tripped its per-model free quota after ~4 calls, so it cannot
  // survive a day of use, see the probe table in the report. Default is now
  // gemini-3.5-flash. Its exact free RPD is unverified (no clean 429 in a spaced probe;
  // its siblings show a per-model 20/day cap). Env GEMINI_MODEL still overrides.
  const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
  return {
    id: "gemini-flash-free",
    async score(i: ScoreInput, signal: AbortSignal): Promise<ScoreResult> {
      const t0 = Date.now();
      const { b64 } = frame(i);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [
              {
                role: "user",
                parts: [
                  { text: userText(i) },
                  { inlineData: { mimeType: "image/jpeg", data: b64 } },
                ],
              },
            ],
            // gemini-3.6-flash is a thinking model: with only maxOutputTokens the
            // budget is spent on hidden thinking tokens and the visible answer comes
            // back empty (finishReason MAX_TOKENS). thinkingBudget:0 disables thinking
            // so the whole budget goes to the JSON answer (B7/lane F fix).
            generationConfig: {
              responseMimeType: "application/json",
              maxOutputTokens: 256,
              temperature: 0,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        },
      );
      if (!res.ok) await readError(res);
      const json: any = await res.json();
      const cand = json?.candidates?.[0];
      const text = cand?.content?.parts?.[0]?.text ?? "";
      // Surface truncation/empty output explicitly so the ensemble treats this as a
      // failed voter (not a silent 0) and the next run shows the real reason.
      if (!text) {
        const reason = cand?.finishReason ?? "empty";
        throw Object.assign(new Error(`gemini empty output (finishReason=${reason})`), {
          status: "malformed_json",
        });
      }
      const { danger, reasons } = parseDanger(text);
      return { provider: "gemini-flash-free", danger, reasons, latencyMs: Date.now() - t0 };
    },
  };
}
