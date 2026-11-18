import { runEnsemble } from './ensemble';
import { ProviderBudget } from './budget';

const ok = (id: any, danger: any, ms = 50) => ({ id, score: async () => ({ provider: id, danger, reasons: ['test'], latencyMs: ms }) });
const fail = (id: any, status: number) => ({ id, score: async () => { throw Object.assign(new Error('x'), { status }); } });
const budget = () => new ProviderBudget({ 'mistral-small-vision': {rpm:60,rpd:100000}, 'groq-llama4-scout': {rpm:30,rpd:14400}, 'gemini-flash-free': {rpm:15,rpd:1500}, 'cloudflare-llama-vision': {rpm:60,rpd:1258}, 'claude-haiku-4-5': {rpm:50,rpd:1e9}, 'claude-opus-5': {rpm:50,rpd:1e9} });
const input = { maskedFrameB64: 'AAA', transcript30s: '', state: 'SAFE' as const };

test('max fusion', async () => { const r = await runEnsemble(input, { scorers: [ok('mistral-small-vision',1), ok('groq-llama4-scout',2)], budget: budget(), claudeFallback: false, timeoutMs: 3000 }); expect(r.danger).toBe(2); expect(r.votes).toHaveLength(2); expect(r.rulesOnly).toBe(false); });
test('one provider 429 is ignored', async () => { const r = await runEnsemble(input, { scorers: [fail('mistral-small-vision',429), ok('groq-llama4-scout',0)], budget: budget(), claudeFallback: false, timeoutMs: 3000 }); expect(r.danger).toBe(0); expect(r.fallbacks).toContain('mistral-small-vision:429'); });
test('all SAFE providers down: gemini borrowed, then rules-only 1', async () => { const r = await runEnsemble(input, { scorers: [fail('mistral-small-vision',429), fail('groq-llama4-scout',503), fail('gemini-flash-free',429)], budget: budget(), claudeFallback: false, timeoutMs: 3000 }); expect(r.danger).toBe(1); expect(r.rulesOnly).toBe(true); expect(r.fallbacks).toContain('gemini-flash-free:429'); });
test('AMBER+ all down: rules-only floor 2', async () => { const r = await runEnsemble({ ...input, state: 'AMBER' }, { scorers: [fail('mistral-small-vision',429), fail('groq-llama4-scout',429), fail('gemini-flash-free',429)], budget: budget(), claudeFallback: false, timeoutMs: 3000 }); expect(r.danger).toBe(2); expect(r.rulesOnly).toBe(true); });
test('claude joins only when fallback on', async () => { const r = await runEnsemble(input, { scorers: [fail('mistral-small-vision',429), fail('groq-llama4-scout',429), fail('gemini-flash-free',429), ok('claude-haiku-4-5',3)], budget: budget(), claudeFallback: true, timeoutMs: 3000 }); expect(r.danger).toBe(3); expect(r.rulesOnly).toBe(false); });
test('a hung provider is cut at the timeout; the other votes still fuse (Q2b)', async () => {
  // A voter that never settles until aborted must not stall fusion: the timeout
  // aborts it, its failure is recorded, and the fast voter's vote still decides.
  const hang = { id: 'mistral-small-vision', score: (_i: any, signal: AbortSignal) => new Promise((_res, rej) => {
    signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { status: 'timeout' })));
  }) } as any;
  const fast = ok('groq-llama4-scout', 2, 10);
  const t0 = Date.now();
  const r = await runEnsemble(input, { scorers: [hang, fast], budget: budget(), claudeFallback: false, timeoutMs: 40 });
  expect(Date.now() - t0).toBeLessThan(1000); // cut promptly at the deadline, not hung
  expect(r.danger).toBe(2); // the fast vote fused
  expect(r.rulesOnly).toBe(false);
  expect(r.fallbacks).toContain('mistral-small-vision:timeout');
});

test('a real AbortError (no .status) is recorded as :timeout, not :err (D2)', async () => {
  // The native fetch abort at the deadline rejects with an AbortError carrying no
  // `.status`; the ensemble must label it `timeout` so a slow voter is visible.
  const abort = { id: 'cloudflare-llama-vision', score: async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); } } as any;
  const r = await runEnsemble({ ...input, state: 'AMBER' }, { scorers: [ok('mistral-small-vision', 1), abort], budget: budget(), claudeFallback: false, timeoutMs: 3000 });
  expect(r.fallbacks).toContain('cloudflare-llama-vision:timeout');
  expect(r.danger).toBe(1);
});

test('budget skips provider at 90% of rpm', () => { const b = budget(); for (let i = 0; i < 27; i++) b.record('groq-llama4-scout'); expect(b.canCall('groq-llama4-scout')).toBe(false); expect(b.canCall('mistral-small-vision')).toBe(true); });
