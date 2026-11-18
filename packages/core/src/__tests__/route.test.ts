import { initialRoute, setCorridor, routeStep } from "../route";
const MIN = 60_000;
const line = [{ lat: 28.60, lng: 77.20 }, { lat: 28.70, lng: 77.20 }];               // 11 km north
const on = (t: number, frac: number) => ({ lat: 28.60 + 0.10 * frac, lng: 77.20 }), dist = (frac: number) => 11_100 * (1 - frac);
const sample = (at: number, fix: { lat: number; lng: number }, distToDestM: number, liveEtaSec: number | null = null) => ({ fix, distToDestM, liveEtaSec, at });
function drive(samples: ReturnType<typeof sample>[], etaSec = 1800) { let st = setCorridor(initialRoute(), line, etaSec, 0); const emits: any[] = []; for (const s of samples) { const r = routeStep(st, s, s.at); st = r.state; if (r.emit) emits.push([s.at / MIN, r.emit]); } return { st, emits }; }

test("on the corridor, approaching: nothing", () => expect(drive(Array.from({ length: 10 }, (_, i) => sample(i * MIN, on(i, i / 10), dist(i / 10)))).emits).toEqual([]));
test("off corridor > 300 m for 3 min → detour once per corridor", () => {
  const off = { lat: 28.65, lng: 77.2035 };                                             // ~340 m east of the line
  const s = [sample(0, on(0, 0.4), dist(0.4)), sample(1 * MIN, off, 6000), sample(2 * MIN, off, 5900), sample(4 * MIN, off, 5800), sample(6 * MIN, off, 5700)];
  expect(drive(s).emits).toEqual([[4, "detour"]]);
});
test("off corridor but back on within 3 min → nothing", () => {
  const off = { lat: 28.65, lng: 77.2035 };
  expect(drive([sample(0, on(0, 0.4), dist(0.4)), sample(1 * MIN, off, 6000), sample(2 * MIN, on(0, 0.5), dist(0.5)), sample(5 * MIN, on(0, 0.6), dist(0.6))]).emits).toEqual([]);
});
test("live ETA > 1.3 × corridor ETA → detour (once)", () => {
  const s = [sample(0, on(0, 0.1), dist(0.1), 1800), sample(2 * MIN, on(0, 0.2), dist(0.2), 2400), sample(4 * MIN, on(0, 0.3), dist(0.3), 2500)];
  expect(drive(s).emits).toEqual([[2, "detour"]]);
});
test("distance to destination increasing for 5 min → away; a new corridor re-arms detour but away needs the distance to fall first", () => {
  const away = [sample(0, on(0, 0.5), 5550), sample(1 * MIN, on(0, 0.48), 5700), sample(3 * MIN, on(0, 0.45), 6100), sample(5 * MIN, on(0, 0.42), 6400), sample(6 * MIN, on(0, 0.40), 6600), sample(8 * MIN, on(0, 0.38), 6800)];
  const { st, emits } = drive(away);
  expect(emits).toEqual([[6, "away"]]);
  const r = routeStep(st, sample(9 * MIN, on(0, 0.36), 7000), 9 * MIN); expect(r.emit).toBeNull();          // asked once
});
test("ETA growing on three consecutive re-routes → away", () => {
  const s = [sample(0, on(0, 0.3), dist(0.3), 1000), sample(2 * MIN, on(0, 0.31), dist(0.31), 1050), sample(4 * MIN, on(0, 0.32), dist(0.32), 1100), sample(6 * MIN, on(0, 0.33), dist(0.33), 1150)];
  expect(drive(s).emits).toEqual([[6, "away"]]);
});
test("hysteresis: +15 m jitter is not 'increasing'", () => {
  const s = [sample(0, on(0, 0.5), 5550), sample(2 * MIN, on(0, 0.5), 5560), sample(4 * MIN, on(0, 0.5), 5570), sample(6 * MIN, on(0, 0.5), 5565), sample(8 * MIN, on(0, 0.5), 5575)];
  expect(drive(s).emits).toEqual([]);
});
