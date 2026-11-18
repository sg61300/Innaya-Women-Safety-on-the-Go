import type { Danger, Deps, EnsembleOutcome, ProviderId, ScoreInput, ScoreResult } from './types';

// SAFE state: the two cheapest/fastest vision voters.
const SAFE_SET: ProviderId[] = ['mistral-small-vision', 'groq-llama4-scout'];
// AMBER and above (R49-B): add the free Gemini AND Cloudflare Workers AI vision
// voters so that when Mistral trips its 30 req/min quota during an alarm, two more
// vision voters keep scoring. Both are only present if their keys are configured.
const AMBER_SET: ProviderId[] = [...SAFE_SET, 'gemini-flash-free', 'cloudflare-llama-vision'];

export async function runEnsemble(
  i: ScoreInput,
  { scorers, budget, claudeFallback, timeoutMs }: Deps,
): Promise<EnsembleOutcome> {
  const byId = new Map(scorers.map((s) => [s.id, s]));
  const fallbacks: string[] = [];
  const votes: ScoreResult[] = [];
  const safe = i.state === 'SAFE';

  const call = async (ids: ProviderId[]) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    await Promise.all(
      ids.map(async (id) => {
        const s = byId.get(id);
        if (!s) return;
        if (!budget.canCall(id)) {
          fallbacks.push(`${id}:budget`);
          return;
        }
        try {
          budget.record(id);
          votes.push(await s.score(i, ctrl.signal));
        } catch (e: any) {
          // A fetch aborted by the fusion deadline rejects with an AbortError that
          // has no `.status`; label it `timeout` (not the opaque `err`) so a slow
          // voter — e.g. the Cloudflare vision model overrunning timeoutMs — is
          // visible in `fallbacks` (D2, R45 lane F3).
          const st = e?.status ?? (e?.name === 'AbortError' ? 'timeout' : 'err');
          if (st === 429) budget.backoff(id, 60_000);
          fallbacks.push(`${id}:${st}`);
        }
      }),
    );
    clearTimeout(t);
  };

  await call(safe ? SAFE_SET : AMBER_SET);
  // SAFE borrow (Q3): when both SAFE vision voters are down, borrow Cloudflare
  // first (large free daily budget), then Gemini as the last resort, so a SAFE
  // tick still gets a vision opinion while Mistral is cooling down.
  if (!votes.length && safe) await call(['cloudflare-llama-vision']);
  if (!votes.length && safe) await call(['gemini-flash-free']);
  if (!votes.length && claudeFallback) await call([safe ? 'claude-haiku-4-5' : 'claude-opus-5']);

  if (!votes.length) {
    // Rules-only floor: never score below the state's minimum when every model is down.
    return { danger: (safe ? 1 : 2) as Danger, votes, fallbacks: [...fallbacks, 'rules-only'], rulesOnly: true };
  }
  return { danger: Math.max(...votes.map((v) => v.danger)) as Danger, votes, fallbacks, rulesOnly: false };
}
