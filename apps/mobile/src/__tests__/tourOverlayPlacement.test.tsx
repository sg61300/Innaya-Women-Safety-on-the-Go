import { Dimensions, StyleSheet } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";
import { TourOverlay } from "../components/tour/TourOverlay";
import { TOUR_STEPS } from "../components/tour/steps";
// Node built-ins via require, as the other guard tests do (no @types/node here).
const fs = require("fs");
const path = require("path");

// Guard for "fix the intro tour. it covers tabs being explained and is not
// adjusting or moving across the screen" (founder, 2026-11-17).
// For every tour step, at three screen sizes and several target positions, the
// tooltip card must (a) never cover the footer or leave the screen ("Never cover
// footer"), (b) not overlap the highlighted target (incl. its 9 px spotlight
// halo) whenever the full card fits on a side, (c) switch to the reduced card
// before it would overlap ("tour cardsize reduction"), overlapping only when even
// the reduced card fits nowhere. Founder rulings 2026-11-17.
// The card's real height is fed in through layout events, the way the native
// layout pass reports it, since jest has no text layout of its own.

let mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("../i18n", () => ({ __esModule: true, default: { on: jest.fn(), off: jest.fn(), t: (k: string) => k } }));

type Rect = { x: number; y: number; w: number; h: number };
const mockTour = { active: true, index: 0, rect: null as Rect | null, next: jest.fn(), prev: jest.fn(), close: jest.fn() };
jest.mock("../components/tour/TourProvider", () => ({ useTour: () => mockTour }));

const FOOTER = 74;
const HALO = 9; // spotlight window (6) + halo ring (3) drawn around the rect
// Screens in dp: small phone, Pixel 7 (1080x2400 @2.625), tall/narrow 20:9.
const SCREENS = [
  { name: "small 360x640", width: 360, height: 640, top: 24, bottom: 0 },
  { name: "Pixel 7 412x915", width: 412, height: 915, top: 32, bottom: 24 },
  { name: "tall 360x800", width: 360, height: 800, top: 28, bottom: 16 },
];
// Card sizes measured with the real overlay in a browser (react-native-web) at
// 360 and 412 wide: chrome (header, title, buttons, step-1 hint) up to ~198 dp,
// body up to 144 dp. Using the largest of each keeps the test pessimistic.
const CHROME = 200;
const BODY = 144;
const HINT = 28; // step-1 hint caption height (hidden in the reduced card)
const SAVE = 26; // reduced card: padding 16->10 (x2), gaps 8->4, 6->2, 14->8
// Target heights per step, as laid out on the owning screen (approximate dp).
const TARGET_H: Record<string, number> = {
  ring: 248, quickActions: 90, journeyCard: 170, tourButton: 40, sos: 64,
  regionsMap: 260, regionCards: 300, route: 120, cityGps: 60, safeWord: 80,
  simulate: 280,
};

async function place(scr: (typeof SCREENS)[number], rect: Rect | null) {
  const utils = await render(<ThemeProvider initial="midnight"><TourOverlay /></ThemeProvider>);
  // Report the natural layout: card = chrome + body, body viewport = content.
  await act(async () => {
    utils.queryByTestId("tour-hint")?.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: scr.width - 64, height: HINT } } });
    const body = utils.queryByTestId("tour-body");
    if (body) {
      fireEvent(body, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: scr.width - 64, height: BODY } } });
      fireEvent(body, "contentSizeChange", scr.width - 64, BODY);
    }
  });
  await act(async () => {
    // Called directly: RNTL's fireEvent skips any event on a view whose responder
    // (the card's swipe PanResponder) declines touch start, layout included.
    utils.getByTestId("tour-card").props.onLayout?.({ nativeEvent: { layout: { x: 16, y: 0, width: scr.width - 32, height: CHROME + BODY } } });
  });
  const card = utils.getByTestId("tour-card");
  const st = StyleSheet.flatten(card.props.style);
  const cardBox = card.children[0] as unknown as { props: { style: object } };
  const compact = (StyleSheet.flatten(cardBox.props.style) as { padding?: number })?.padding === 10;
  const natural = CHROME + BODY - (compact ? SAVE + (mockTour.index === 0 ? HINT + 10 : 0) : 0);
  const top = st.top as number;
  const h = Math.min(natural, (st.maxHeight as number | undefined) ?? Infinity);
  return { top, bottom: top + h, rect, compact };
}

describe.each(SCREENS)("tour card placement on $name", (scr) => {
  let dims: jest.SpyInstance;
  beforeEach(() => {
    mockInsets = { top: scr.top, bottom: scr.bottom, left: 0, right: 0 };
    dims = jest.spyOn(Dimensions, "get").mockReturnValue({ width: scr.width, height: scr.height, scale: 2.625, fontScale: 1 });
  });
  afterEach(() => dims.mockRestore());

  const topSafe = scr.top + 6;
  const botSafe = scr.height - FOOTER - scr.bottom - 6;

  // Positions the target can take on screen: just under the header, middle,
  // just above the footer, and (for sos) inside the footer tab bar itself.
  const cases = TOUR_STEPS.flatMap((s, i) => {
    const h = TARGET_H[s.id];
    const ys = s.id === "sos"
      ? [scr.height - scr.bottom - FOOTER + 4]
      : [topSafe + 8, Math.round((scr.height - h) / 2), botSafe - h - 4];
    return ys.map((y) => [s.id, y, i, h] as const);
  });

  test.each(cases)("step %s, target at y=%d: card never covers it and stays on screen", async (id, y, i, h) => {
    mockTour.index = i;
    const rect = { x: 16, y, w: scr.width - 32, h };
    mockTour.rect = rect;
    const c = await place(scr, rect);
    const hiTop = rect.y - HALO;
    const hiBot = rect.y + rect.h + HALO;
    // Room on each side, keeping the overlay's 6 dp gap from the halo.
    const GAP = 6;
    const room = Math.max(hiTop - GAP - topSafe, botSafe - hiBot - GAP);
    const reducedMin = CHROME - SAVE - (i === 0 ? HINT + 10 : 0) + 20;
    const overlap = c.top < hiBot && c.bottom > hiTop;
    const where = `${scr.name} step ${id} target y=${y} h=${h}: card ${c.top}-${c.bottom} (compact ${c.compact}) vs ${hiTop}-${hiBot}`;
    // Never off the top, never over the footer, in every case.
    expect(c.top).toBeGreaterThanOrEqual(topSafe);
    expect(c.bottom).toBeLessThanOrEqual(botSafe);
    if (room >= CHROME + 40) {
      // Full card fits on a side: full card, target clear.
      if (overlap || c.compact) throw new Error(`full card expected, target clear: ${where}`);
    } else if (room >= reducedMin) {
      // Only the reduced card fits: reduced card, target still clear.
      if (overlap || !c.compact) throw new Error(`reduced card expected, target clear: ${where}`);
    } else {
      // Fits nowhere: the reduced card is used before any overlap is accepted.
      if (!c.compact) throw new Error(`reduced card expected before overlapping: ${where}`);
    }
  });

  test("steps without a measured target centre the card inside the safe band", async () => {
    mockTour.index = 8;
    mockTour.rect = null;
    const c = await place(scr, null);
    expect(c.top).toBeGreaterThanOrEqual(topSafe);
    expect(c.bottom).toBeLessThanOrEqual(botSafe);
  });
});

// Founder 2026-11-17 "Add the targets": every step, including route, cityGps and
// safeWord on journey/new, has a <TourTarget id="..."> on a screen, so no step
// falls back to a card with no spotlight.
test("every tour step has a TourTarget on a screen", () => {
  const root = path.dirname((require as any).resolve("../../package.json"));
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }) as { name: string; isDirectory: () => boolean }[]) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") walk(f); }
      else if (/\.tsx$/.test(e.name)) files.push(fs.readFileSync(f, "utf8"));
    }
  };
  walk(path.join(root, "app"));
  walk(path.join(root, "src/components"));
  const src = files.join("\n");
  const missing = TOUR_STEPS.filter((s) => !new RegExp(`<TourTarget[^>]*\\sid="${s.targetId}"`).test(src)).map((s) => s.id);
  expect(missing).toEqual([]);
});
