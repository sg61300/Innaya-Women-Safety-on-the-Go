import { initialStationary, stationaryStep, deferForTraffic, tier2Passed } from "../stationary";
import { STATIONARY_T1_MS, STATIONARY_T2_MS, STATIONARY_MAX_DEFER_MS } from "../timers";
const O = { lat: 28.60, lng: 77.20 }, D = { lat: 28.70, lng: 77.30 };
const HERE = { lat: 28.65, lng: 77.25 };                      // far from both endpoints
const fix = (at: number, dLat = 0, accuracyM = 15, speedMps: number|null = 0) => ({ lat: HERE.lat + dLat, lng: HERE.lng, accuracyM, speedMps, at });
const MIN = 60_000;
function run(fixes: ReturnType<typeof fix>[]) { let st = initialStationary(); const emits: any[] = []; for (const f of fixes) { const r = stationaryStep(st, f, f.at, { origin: O, dest: D }); st = r.state; if (r.emit) emits.push({ at: f.at, ...r.emit }); } return { st, emits }; }

test("still for 15 min → tier 1 once; 30 min → tier 2 once", () => {
  const fixes = Array.from({ length: 31 }, (_, i) => fix(i * MIN));
  const { emits } = run(fixes);
  expect(emits).toEqual([{ at: STATIONARY_T1_MS, tier: 1 }, { at: STATIONARY_T2_MS, tier: 2 }]);
});
test("a fix outside the adaptive radius resets the clock and the anchor", () => {
  const fixes = [fix(0), fix(10 * MIN), fix(11 * MIN, 0.002 /* ~220 m */), ...Array.from({ length: 16 }, (_, i) => fix((12 + i) * MIN, 0.002))];
  const { emits } = run(fixes);
  expect(emits).toEqual([{ at: 26 * MIN, tier: 1 }]);       // anchor moved at minute 11; 15 min later = 26
});
test("radius adapts to accuracy: 40 m drift is still under poor GPS (accuracy 45 → radius 90) but not under good GPS (radius 60)", () => {
  const poor = run([fix(0, 0, 45), fix(16 * MIN, 0.00036 /* ~40 m */, 45)]).emits;   // 40 m < 90 m radius → still → tier 1
  expect(poor).toEqual([{ at: 16 * MIN, tier: 1 }]);
  const drift = 0.0006;                                                                   // ~67 m > 60 m radius
  expect(run([fix(0, 0, 10), fix(16 * MIN, drift, 10)]).emits).toEqual([]);
});
test("walking speed resets", () => expect(run([fix(0), fix(14 * MIN, 0, 15, 1.4), fix(16 * MIN)]).emits).toEqual([]));
test("nothing fires within 150 m of origin or destination", () => {
  const atOrigin = (at: number) => ({ lat: O.lat + 0.0005, lng: O.lng, accuracyM: 10, speedMps: 0, at });   // ~55 m from origin
  let st = initialStationary(); for (let i = 0; i <= 31; i++) { const r = stationaryStep(st, atOrigin(i * MIN), i * MIN, { origin: O, dest: D }); st = r.state; expect(r.emit).toBeNull(); }
});
test("a GPS dropout under 2 min keeps the clock; over 2 min resets", () => {
  let st = initialStationary(); st = stationaryStep(st, fix(0), 0, { origin: O, dest: D }).state;
  st = stationaryStep(st, null, 90_000, { origin: O, dest: D }).state;               // 90 s no fix
  expect(stationaryStep(st, fix(15 * MIN), 15 * MIN, { origin: O, dest: D }).emit).toEqual({ tier: 1 });
  let s2 = initialStationary(); s2 = stationaryStep(s2, fix(0), 0, { origin: O, dest: D }).state;
  s2 = stationaryStep(s2, null, 3 * MIN, { origin: O, dest: D }).state;               // 3 min no fix → reset
  expect(stationaryStep(s2, fix(15 * MIN), 15 * MIN, { origin: O, dest: D }).emit).toBeNull();
});
test("traffic deferral: tier 2 waits 15 min at a time, never past 60 min still", () => {
  let st = initialStationary(); st = stationaryStep(st, fix(0), 0, { origin: O, dest: D }).state;
  st = deferForTraffic(st, 600, 1200, 15 * MIN);                                       // in-traffic 2× → defer to 30+15
  const emits: any[] = [];
  for (let i = 1; i <= 61; i++) { const r = stationaryStep(st, fix(i * MIN), i * MIN, { origin: O, dest: D }); st = r.state; if (r.emit?.tier === 2) emits.push(i); if (i === 30 || i === 45) st = deferForTraffic(st, 600, 1200, i * MIN); }
  expect(emits).toEqual([60]);
  expect(deferForTraffic(initialStationary(), 600, 700, 0).deferUntil).toBeNull();      // 1.17× is not traffic
});
test("tier 2 passed: fresh 30-min clock at the same anchor; third pass emits the unusual note", () => {
  let st = initialStationary(); st = stationaryStep(st, fix(0), 0, { origin: O, dest: D }).state;
  st = { ...st, tier2At: 30 * MIN };
  let r = tier2Passed(st, 30 * MIN); expect(r.emit).toBeNull(); expect(r.state.stillSince).toBe(30 * MIN); expect(r.state.tier2At).toBeNull(); expect(r.state.tier1At).not.toBeNull();
  r = tier2Passed({ ...r.state, tier2At: 60 * MIN }, 60 * MIN); expect(r.emit).toBeNull();
  r = tier2Passed({ ...r.state, tier2At: 90 * MIN }, 90 * MIN); expect(r.emit).toEqual({ note: "unusual" });
});
