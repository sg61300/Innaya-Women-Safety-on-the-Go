// Server-side Mixpanel tracking. Fire-and-forget: never blocks or fails a
// request. No-op (one warn) when MIXPANEL_TOKEN is unset, so nothing breaks in
// dev or before the founder provisions a project. Server events need no APK; the
// mobile SDK (client events) does. Region: MIXPANEL_REGION=eu routes to the EU
// residency host, anything else uses the default US host.

type MixpanelEvent = {
  event: string;
  distinctId: string | null;
  insertId?: string | null; // events row id, Mixpanel dedupes on $insert_id
  props?: Record<string, unknown>;
};

let warned = false;

function host(): string {
  return process.env.MIXPANEL_REGION === "eu" ? "https://api-eu.mixpanel.com" : "https://api.mixpanel.com";
}

// Send a batch of events in one call. Returns true if a request was made, false
// if it no-oped (no token). Errors are swallowed after a single console line.
export async function track(batch: MixpanelEvent[]): Promise<boolean> {
  const token = process.env.MIXPANEL_TOKEN;
  if (!token) {
    if (!warned) {
      warned = true;
      console.warn("[mixpanel] MIXPANEL_TOKEN unset, skipping server-side tracking");
    }
    return false;
  }
  if (!batch.length) return false;

  const now = Date.now();
  const payload = batch.map((e) => ({
    event: e.event,
    properties: {
      token,
      time: now,
      distinct_id: e.distinctId ?? undefined,
      $insert_id: e.insertId ?? undefined,
      ...e.props,
    },
  }));

  try {
    await fetch(`${host()}/track?verbose=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (e) {
    console.warn("[mixpanel] track failed", e instanceof Error ? e.message : "error");
    return false;
  }
}

// Convenience wrapper for a single event.
export function trackOne(e: MixpanelEvent): Promise<boolean> {
  return track([e]);
}
