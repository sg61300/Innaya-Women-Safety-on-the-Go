import { TOUR_STEPS } from "../components/tour/steps";
import en from "../i18n/en.json";

test("11 steps, unique ids, valid routes, copy present", () => {
  expect(TOUR_STEPS).toHaveLength(11);
  expect(new Set(TOUR_STEPS.map(s => s.id)).size).toBe(11);
  const routes = new Set(["/(user)/home", "/(user)/regions", "/(user)/journey/new", "/(user)/simulate"]);
  for (const s of TOUR_STEPS) {
    expect(routes.has(s.route)).toBe(true);
    for (const k of [s.tagKey, s.titleKey, s.bodyKey]) expect(k.split(".").reduce((o: any, p) => o?.[p], en)).toEqual(expect.any(String));
  }
  expect(TOUR_STEPS.map(s => s.id)).toEqual(["ring", "quickActions", "journeyCard", "tourButton", "sos", "regionsMap", "regionCards", "route", "cityGps", "safeWord", "simulate"]);
});

// Guard: the user tour has no Guardians step and never opens Profile (the guardian side
// gets its own separate intro, founder 2026-11-17).
test("no Guardians step in the user tour", () => {
  expect(TOUR_STEPS.some(s => s.id === "guardians" || s.targetId === "guardians")).toBe(false);
  expect(TOUR_STEPS.some(s => (s.route as string) === "/(user)/profile")).toBe(false);
});
