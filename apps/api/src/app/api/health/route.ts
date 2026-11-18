// Health probe. `providers` is consumed by the mobile diagnostics screen (V12).
export async function GET() {
  const providers = (process.env.SCORER_PROVIDERS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return Response.json({ ok: true, providers, ts: new Date().toISOString() });
}
