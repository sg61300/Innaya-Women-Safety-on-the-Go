import { z } from "zod";
import { admin } from "@/lib/supabaseAdmin";
import { trackOne } from "@/lib/mixpanel";

// Server-side sink for site (non-journey) funnel events. It records
// products_opened (the collection open, m6/m8 denominator) and product_viewed (a
// detail-page open). The site posts a beacon on page open; the row is written
// server-side so there is no APK dependency, and Mixpanel is mirrored
// fire-and-forget.
//
// Allowlist the accepted types so a public endpoint cannot write arbitrary event
// rows. distinct_id is the signed-in user or an anonymous per-browser visitor id.

const TYPES = ["products_opened", "product_viewed"] as const;

const Body = z.object({
  type: z.enum(TYPES),
  user_id: z.string().trim().uuid().optional(),
  visitor_id: z.string().trim().max(64).optional(),
  // R64: site events carry the product slug and tier so the metrics views can
  // attribute demand. Both optional: the collection page has no single product,
  // and a detail view has a product slug but no chosen tier.
  product: z.string().trim().max(64).optional(),
  tier: z.string().trim().max(32).optional(),
  props: z.record(z.unknown()).optional(),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const d = parsed.data;
  const props = {
    ...(d.props ?? {}),
    visitor_id: d.visitor_id ?? null,
    product: d.product ?? null,
    tier: d.tier ?? null,
  };

  try {
    const { data: evt, error } = await admin()
      .from("events")
      .insert({ type: d.type, user_id: d.user_id ?? null, payload: props })
      .select("id")
      .single();
    if (error) {
      console.error("[metrics] insert failed", (error as { code?: string }).code ?? "unknown");
      return Response.json({ ok: false, error: "server_error" }, { status: 500 });
    }
    void trackOne({
      event: d.type,
      distinctId: d.user_id ?? d.visitor_id ?? null,
      insertId: (evt as { id?: string } | null)?.id?.toString() ?? null,
      props,
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[metrics]", e instanceof Error ? e.message : "error");
    return Response.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
