// The 12 spotlight-tour steps in walk order across five screens. Copy lives in
// i18n (en.json `tour.<id>.tag|title|body`); each step names a target id that a
// <TourTarget id="…"> on the owning screen registers so the overlay can measure
// it. Order and emoji/tag/tip reproduce the prototype (Design/02 §4.3).
export type TourRoute =
  | "/(user)/home"
  | "/(user)/regions"
  | "/(user)/journey/new"
  | "/(user)/simulate"
  | "/(user)/profile";

export type TourStep = {
  id: string;
  route: TourRoute;
  targetId: string;
  emoji: string;
  tagKey: string;
  titleKey: string;
  bodyKey: string;
  tip: "above" | "below";
};

const step = (id: string, route: TourRoute, emoji: string, tip: "above" | "below"): TourStep => ({
  id,
  route,
  targetId: id,
  emoji,
  tagKey: `tour.${id}.tag`,
  titleKey: `tour.${id}.title`,
  bodyKey: `tour.${id}.body`,
  tip,
});

export const TOUR_STEPS: TourStep[] = [
  step("ring", "/(user)/home", "🌸", "below"),
  step("quickActions", "/(user)/home", "👋", "above"),
  step("journeyCard", "/(user)/home", "🗺️", "above"),
  step("tourButton", "/(user)/home", "❓", "below"),
  step("sos", "/(user)/home", "🆘", "above"),
  step("regionsMap", "/(user)/regions", "⚠️", "below"),
  step("regionCards", "/(user)/regions", "📋", "above"),
  step("route", "/(user)/journey/new", "📍", "below"),
  step("cityGps", "/(user)/journey/new", "📡", "below"),
  step("safeWord", "/(user)/journey/new", "🔑", "above"),
  step("simulate", "/(user)/simulate", "🎯", "below"),
  step("guardians", "/(user)/profile", "👥", "below"),
];
