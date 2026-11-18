// Task 24b review (W3-A). vitals.start must derive a resting baseline from the
// first few samples, not from sample #1 — a user already stressed at journey
// start would otherwise get a high baseline and never trip. A fake source (mocked
// SimulatedVitals) lets us drive samples with controlled hr/ts. events is mocked
// so nothing touches Supabase.
let mockSourceCb: (s: { hr: number; hrv: number | null; ts: number }) => void;
jest.mock("../services/vitalsSimulated", () => ({
  SimulatedVitals: class {
    name = "simulated" as const;
    async start(cb: any) {
      mockSourceCb = cb;
    }
    async stop() {}
  },
}));
jest.mock("../lib/events", () => ({ events: { log: jest.fn() } }));

import { events } from "../lib/events";
import { vitals } from "../services/vitals";
import { useJourney } from "../store/journey";

test("A5: baseline is the resting minimum of the first 5 samples; stress fires after 20 s", async () => {
  (globalThis as any).__DEV__ = true;
  await vitals.select("simulated");
  const send = jest.fn();
  await vitals.start(send);
  const emit = (hr: number, ts: number) => mockSourceCb({ hr, hrv: null, ts });

  // A stressed opening: sample #1 is 128. Baseline must be the min of the first
  // five (72), not 128 — else 128 never reads as elevated.
  emit(128, 0);
  emit(128, 1000);
  emit(72, 2000);
  emit(72, 3000);
  emit(72, 4000); // 5th sample: baseline = min(...) = 72
  emit(128, 5000); // elevated (128 > 72 + 35), start the 20 s clock
  expect(send).not.toHaveBeenCalled();
  emit(128, 25000); // 20 s sustained → fire
  expect(send).toHaveBeenCalledWith({ type: "SCORE", score: 1, reasons: ["vitals_stress"] });
  expect((events.log as jest.Mock).mock.calls.at(-1)![1].baseline).toBe(72);
});

test("A5b: start() with no source marks the vitals sensor false", async () => {
  await vitals.select("ble"); // unavailable → current stays null
  useJourney.getState().set({
    sensors: { mic: false, cam: false, gps: false, ble: false, vitals: true },
  });
  await vitals.start(jest.fn());
  expect(useJourney.getState().sensors.vitals).toBe(false);
});
