import type { ScoreInput, ScoreResult, Scorer } from "@vaira/core";
import { SYSTEM, frame, parseDanger, readError, userText } from "./shared";

// P7.2 (lane F) + Q3 (lane F2, 2026-09-06): Cloudflare Workers AI vision voter.
// Probed live: 200 OK, valid JSON, ~7.95 neurons/call (frame + transcript). Free
// tier is 10,000 neurons/day -> ~1258 scores/day (10000 / 7.95 ≈ 1258). Wired into
// buildScorers/runEnsemble as of R49-B: it is a vision voter in the AMBER_SET and
// the SAFE borrow chain, covering vision when Mistral is cooling down.
//
// Model requires a one-time per-account license acceptance (prompt: "agree")
// before the vision endpoint stops returning 403 "Model Agreement", already
// done for this account during the live probe.
export function cloudflareScorer(accountId: string, apiToken: string): Scorer {
  const model = process.env.CLOUDFLARE_MODEL ?? "@cf/meta/llama-3.2-11b-vision-instruct";
  return {
    id: "cloudflare-llama-vision",
    async score(i: ScoreInput, signal: AbortSignal): Promise<ScoreResult> {
      const t0 = Date.now();
      const { b64 } = frame(i);
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: "POST",
          signal,
          headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: userText(i) },
            ],
            image: Array.from(Buffer.from(b64, "base64")),
            max_tokens: 256,
          }),
        },
      );
      if (!res.ok) await readError(res);
      const json: any = await res.json();
      if (json?.success === false) {
        throw Object.assign(new Error(json?.errors?.[0]?.message ?? "cloudflare ai error"), {
          status: json?.errors?.[0]?.code ?? "err",
        });
      }
      const response = json?.result?.response;
      const text = typeof response === "string" ? response : JSON.stringify(response ?? "");
      const { danger, reasons } = parseDanger(text);
      return { provider: "cloudflare-llama-vision", danger, reasons, latencyMs: Date.now() - t0 };
    },
  };
}
