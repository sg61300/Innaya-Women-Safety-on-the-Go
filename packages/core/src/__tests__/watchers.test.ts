import { assignWatchers } from "../watchers";
const c = (id: string, tier: "primary"|"buffer", response: "accept"|"decline"|null, respondedAt: number|null, lastSeenAt: number|null) => ({ id, tier, response, respondedAt, lastSeenAt });
test("scenario 1: all primaries accept → first 3 active, rest queued", () => {
  const r = assignWatchers({ contacts: [c("a","primary","accept",10,100), c("b","primary","accept",20,100), c("c","primary","accept",5,100), c("d","primary","accept",30,100)], requestedAt: 0, buffersRequestedAt: null, now: 100 });
  expect(r.active).toEqual(["c","a","b"]); expect(r.queued).toEqual(["d"]); expect(r.requestBuffers).toBe(false); expect(r.noneAvailable).toBe(false);
});
test("scenario 2: no primary accepts within 3 min → request buffers", () => {
  const r = assignWatchers({ contacts: [c("a","primary",null,null,null), c("x","buffer",null,null,null)], requestedAt: 0, buffersRequestedAt: null, now: 180_000 });
  expect(r.requestBuffers).toBe(true); expect(r.active).toEqual([]);
});
test("scenario 3: active primaries go inactive → buffers requested; accepted buffer becomes active", () => {
  const r = assignWatchers({ contacts: [c("a","primary","accept",10,0), c("x","buffer","accept",50,300_000)], requestedAt: 0, buffersRequestedAt: 200_000, now: 300_000 });
  expect(r.active).toEqual(["x"]); expect(r.requestBuffers).toBe(false);
  const r2 = assignWatchers({ contacts: [c("a","primary","accept",10,0)], requestedAt: 0, buffersRequestedAt: null, now: 300_000 });
  expect(r2.active).toEqual([]); expect(r2.requestBuffers).toBe(true);
});
test("scenario 4: nobody available after buffers window → noneAvailable", () => {
  const r = assignWatchers({ contacts: [c("a","primary","decline",5,null), c("x","buffer",null,null,null)], requestedAt: 0, buffersRequestedAt: 180_000, now: 360_001 });
  expect(r.noneAvailable).toBe(true);
});
test("accepted contact with null lastSeenAt is never active", () => {
  const r = assignWatchers({ contacts: [c("a","primary","accept",10,null)], requestedAt: 0, buffersRequestedAt: null, now: 100 });
  expect(r.active).toEqual([]); expect(r.queued).toEqual([]);
});
