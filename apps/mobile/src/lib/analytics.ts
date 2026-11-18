// Client-side Mixpanel mirror for the funnel taxonomy. This is intentionally
// dependency-free at build time: mixpanel-react-native is required lazily inside
// try/catch, so the app builds and tests run whether or not the SDK is installed.
// It activates only once BOTH are true: EXPO_PUBLIC_MIXPANEL_TOKEN is set AND the
// SDK is installed (which needs a new APK, unlike the server-side events rows).
//
// Only the taxonomy funnel events are mirrored, never the high-frequency runtime
// events (frame, keyword, heartbeat), so Mixpanel volume stays sane. Screen-view
// tracking is a separate founder step (the SDK's automatic screen tracking).

const TAXONOMY = new Set<string>([
  "signup_completed",
  "journey_completed",
  "regions_opened",
  "golive_started",
  "tools_opened",
  "tool_clicked",
  "classes_opened",
  "class_card_selected",
  "class_call_clicked",
  "class_map_clicked",
  "products_opened",
]);

type Mp = { track: (name: string, props?: Record<string, unknown>) => void; identify: (id: string) => void } | null;

let mp: Mp = null;
let tried = false;

function client(): Mp {
  if (tried) return mp;
  tried = true;
  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
  if (!token) return null; // no-op until the founder provisions a token
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Mixpanel } = require("mixpanel-react-native");
    const instance = new Mixpanel(token, true);
    instance.init();
    mp = instance;
  } catch {
    // SDK not installed yet, stays a no-op. See Architecture/08 founder steps.
    mp = null;
  }
  return mp;
}

export const analytics = {
  track(type: string, payload: unknown, userId: string | null) {
    if (!TAXONOMY.has(type)) return;
    const c = client();
    if (!c) return;
    try {
      if (userId) c.identify(userId);
      c.track(type, (payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}));
    } catch {
      /* never let analytics break a flow */
    }
  },
};
