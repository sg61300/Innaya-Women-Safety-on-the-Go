// Apply one repo migration to the hosted Supabase project through the Management API
// and record it in supabase_migrations.schema_migrations (so a later `db push` skips it).
// Usage (from repo root):  node scripts/db/apply-migration.mjs supabase/migrations/0022_cancel_calls.sql
// Reads SUPABASE_ACCESS_TOKEN from apps/api/.env.local. Founder runs this; never the orchestrator.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const REF = process.env.SUPABASE_PROJECT_REF;
if (!REF) { console.error("Set SUPABASE_PROJECT_REF to your Supabase project ref."); process.exit(2); }
const file = process.argv[2];
if (!file) { console.error("usage: node scripts/db/apply-migration.mjs <migration.sql>"); process.exit(2); }

const env = readFileSync("apps/api/.env.local", "utf8");
const token = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!token) { console.error("SUPABASE_ACCESS_TOKEN missing in apps/api/.env.local"); process.exit(2); }

const version = basename(file).split("_")[0];
const name = basename(file).replace(/\.sql$/, "");
const sql = readFileSync(file, "utf8");

async function query(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text}`);
  return text;
}

const already = await query(`select version from supabase_migrations.schema_migrations where version = '${version}'`);
if (already.includes(version)) { console.log(`${name}: already recorded, skipping`); process.exit(0); }

console.log(`${name}: applying ...`);
await query(sql);
await query(`insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}')`);
console.log(`${name}: applied and recorded`);
