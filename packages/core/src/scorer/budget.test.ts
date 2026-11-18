import { ProviderBudget } from './budget';

const limits = {
  'mistral-small-vision': { rpm: 60, rpd: 100000 },
  'groq-llama4-scout': { rpm: 30, rpd: 14400 },
  'gemini-flash-free': { rpm: 15, rpd: 1500 },
  'cloudflare-llama-vision': { rpm: 60, rpd: 1258 },
  'claude-haiku-4-5': { rpm: 50, rpd: 1e9 },
  'claude-opus-5': { rpm: 50, rpd: 1e9 },
} as const;

test('canCall is true for a fresh provider and blocks at 90% of rpm', () => {
  const b = new ProviderBudget({ ...limits });
  expect(b.canCall('groq-llama4-scout')).toBe(true);
  for (let i = 0; i < 26; i++) b.record('groq-llama4-scout'); // 26 < 0.9*30=27
  expect(b.canCall('groq-llama4-scout')).toBe(true);
  b.record('groq-llama4-scout'); // 27 == 27
  expect(b.canCall('groq-llama4-scout')).toBe(false);
});

test('providers are budgeted independently', () => {
  const b = new ProviderBudget({ ...limits });
  for (let i = 0; i < 27; i++) b.record('groq-llama4-scout');
  expect(b.canCall('groq-llama4-scout')).toBe(false);
  expect(b.canCall('mistral-small-vision')).toBe(true);
});

test('the rpm window slides: old calls age out after 60s', () => {
  let t = 1_000_000;
  const b = new ProviderBudget({ ...limits }, () => t);
  for (let i = 0; i < 27; i++) b.record('groq-llama4-scout');
  expect(b.canCall('groq-llama4-scout')).toBe(false);
  t += 61_000; // all 27 calls are now older than 60s
  expect(b.canCall('groq-llama4-scout')).toBe(true);
});

test('rpd caps at 90% of the daily limit regardless of the sliding window', () => {
  let t = 5_000_000;
  const b = new ProviderBudget({ 'gemini-flash-free': { rpm: 100000, rpd: 10 } } as any, () => t);
  for (let i = 0; i < 9; i++) { b.record('gemini-flash-free'); t += 1000; } // 9 == 0.9*10, spread so rpm never bites
  expect(b.canCall('gemini-flash-free')).toBe(false);
});

test('backoff blocks a provider until the window elapses', () => {
  let t = 2_000_000;
  const b = new ProviderBudget({ ...limits }, () => t);
  expect(b.canCall('mistral-small-vision')).toBe(true);
  b.backoff('mistral-small-vision', 60_000);
  expect(b.canCall('mistral-small-vision')).toBe(false);
  t += 60_001;
  expect(b.canCall('mistral-small-vision')).toBe(true);
});
