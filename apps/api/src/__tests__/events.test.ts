jest.mock("@/lib/supabaseAdmin", () => {
  const insert = jest.fn().mockResolvedValue({ error: null });
  const rpc = jest.fn().mockResolvedValue({ data: 7, error: null });
  return { admin: () => ({ from: () => ({ insert }), rpc }), __m: { insert, rpc } };
});
import { logEvent } from "@/lib/events";
const { __m } = jest.requireMock("@/lib/supabaseAdmin");

test("logEvent uses next_event_seq and inserts one row", async () => {
  await logEvent({ journeyId: "j1", type: "state_change", payload: { to: "AMBER" } });
  expect(__m.rpc).toHaveBeenCalledWith("next_event_seq", { p_journey_id: "j1" });
  expect(__m.insert).toHaveBeenCalledWith(
    expect.objectContaining({ journey_id: "j1", seq: 7, type: "state_change" }),
  );
});

test("logEvent with null journeyId skips next_event_seq and inserts seq 0", async () => {
  __m.rpc.mockClear();
  __m.insert.mockClear();
  await logEvent({ journeyId: null, type: "boot" });
  expect(__m.rpc).not.toHaveBeenCalled();
  expect(__m.insert).toHaveBeenCalledWith(
    expect.objectContaining({ journey_id: null, seq: 0, type: "boot", payload: {} }),
  );
});
