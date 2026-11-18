import { SimulatedVitals } from "../services/vitalsSimulated";

test("simulated trace spikes after 60 s and returns to baseline", () => {
  jest.useFakeTimers();
  const seen: number[] = [];
  const v = new SimulatedVitals(1000);
  v.start((s) => seen.push(s.hr));
  jest.advanceTimersByTime(70_000);
  expect(seen[0]).toBe(72);
  expect(Math.max(...seen)).toBe(128);
  jest.advanceTimersByTime(30_000);
  expect(seen.at(-1)).toBe(72);
  v.stop();
  jest.useRealTimers();
});

test("hrv drops while stressed and stop() halts emissions", () => {
  jest.useFakeTimers();
  const seen: { hr: number; hrv: number | null }[] = [];
  const v = new SimulatedVitals(1000);
  v.start((s) => seen.push({ hr: s.hr, hrv: s.hrv }));
  jest.advanceTimersByTime(70_000);
  // A spike sample carries the low-HRV reading, a baseline sample the high one.
  const spike = seen.find((s) => s.hr === 128)!;
  const rest = seen.find((s) => s.hr === 72)!;
  expect(spike.hrv).toBe(18);
  expect(rest.hrv).toBe(55);
  v.stop();
  const count = seen.length;
  jest.advanceTimersByTime(30_000);
  expect(seen.length).toBe(count); // no samples after stop()
  jest.useRealTimers();
});

// F14 (b16): demo-scenario profiles + inferred label.
import { demoSample, vitalsLabel, DEMO_PROFILES, DEMO_SCENARIOS } from "../services/vitalsSimulated";

test("F14: every demo scenario samples within its declared ranges", () => {
  for (const sc of DEMO_SCENARIOS) {
    const pr = DEMO_PROFILES[sc];
    for (let n = 0; n < 200; n++) {
      const s = demoSample(sc);
      expect(s.hr).toBeGreaterThanOrEqual(pr.hr[0]);
      expect(s.hr).toBeLessThanOrEqual(pr.hr[1]);
      expect(s.spo2).toBeGreaterThanOrEqual(pr.spo2[0]);
      expect(s.spo2).toBeLessThanOrEqual(pr.spo2[1]);
      expect(s.breathing).toBeGreaterThanOrEqual(pr.breathing[0]);
      expect(s.breathing).toBeLessThanOrEqual(pr.breathing[1]);
      expect(s.hrv).toBeGreaterThanOrEqual(pr.hrv[0]);
      expect(s.hrv).toBeLessThanOrEqual(pr.hrv[1]);
    }
  }
});

test("F14: label mapping - calm < 100, elevated 100-129, panic >= 130", () => {
  expect(vitalsLabel(66)).toBe("calm");
  expect(vitalsLabel(54)).toBe("calm");   // sleeping
  expect(vitalsLabel(85)).toBe("calm");   // happy
  expect(vitalsLabel(108)).toBe("elevated");
  expect(vitalsLabel(129)).toBe("elevated");
  expect(vitalsLabel(130)).toBe("panic");
  expect(vitalsLabel(150)).toBe("panic");
});
