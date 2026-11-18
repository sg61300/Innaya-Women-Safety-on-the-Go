import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let c: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (!c) {
    c = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return c;
}
