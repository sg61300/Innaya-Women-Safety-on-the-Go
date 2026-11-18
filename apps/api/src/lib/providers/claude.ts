import Anthropic from "@anthropic-ai/sdk";
import type { ProviderId, ScoreInput, ScoreResult, Scorer } from "@vaira/core";
import { SYSTEM, frame, parseDanger, userText } from "./shared";

// Claude fallback voter. Present but DISABLED in the pilot: no Anthropic key and
// CLAUDE_FALLBACK=off (ADR-032). Only registered when CLAUDE_FALLBACK=on.
// `id` is 'claude-haiku-4-5' for the SAFE tier or 'claude-opus-5' for AMBER+.
export function claudeScorer(id: Extract<ProviderId, "claude-haiku-4-5" | "claude-opus-5">, apiKey: string): Scorer {
  const client = new Anthropic({ apiKey });
  return {
    id,
    async score(i: ScoreInput, signal: AbortSignal): Promise<ScoreResult> {
      const t0 = Date.now();
      const { b64 } = frame(i);
      const res: any = await (client as any).messages.create(
        {
          model: id,
          max_tokens: 256,
          system: SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
                { type: "text", text: userText(i) },
              ],
            },
          ],
        },
        { signal },
      );
      const text = Array.isArray(res?.content)
        ? res.content.find((b: any) => b.type === "text")?.text ?? ""
        : "";
      const { danger, reasons } = parseDanger(text);
      return { provider: id, danger, reasons, latencyMs: Date.now() - t0 };
    },
  };
}
