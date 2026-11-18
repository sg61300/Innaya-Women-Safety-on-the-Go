import { TOUR_STEPS } from "../components/tour/steps";
import en from "../i18n/en.json";

test("12 steps, unique ids, valid routes, copy present", () => {
  expect(TOUR_STEPS).toHaveLength(12);
  expect(new Set(TOUR_STEPS.map(s => s.id)).size).toBe(12);
  const routes = new Set(["/(user)/home", "/(user)/regions", "/(user)/journey/new", "/(user)/simulate", "/(user)/profile"]);
  for (const s of TOUR_STEPS) {
    expect(routes.has(s.route)).toBe(true);
    for (const k of [s.tagKey, s.titleKey, s.bodyKey]) expect(k.split(".").reduce((o: any, p) => o?.[p], en)).toEqual(expect.any(String));
  }
  expect(TOUR_STEPS.map(s => s.id)).toEqual(["ring", "quickActions", "journeyCard", "tourButton", "sos", "regionsMap", "regionCards", "route", "cityGps", "safeWord", "simulate", "guardians"]);
  expect((en as any).tour.guardians.body).toContain("3 minutes");
});
