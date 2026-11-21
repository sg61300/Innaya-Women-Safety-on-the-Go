// Fix lane D6 (founder Q127): trip photos are deleted 30 days after they were taken.
// A small in-memory storage stands in for the bucket; the list call returns every
// object older than p_before, even ones the app must keep, so the code's own guard is
// what the tests prove (migration 0034's live-alarm rule is in supabase/tests/0034).
jest.mock("@/lib/supabaseAdmin", () => ({ admin: jest.fn() }));
import { photoRetentionTick, isRetentionTarget, PHOTO_RETENTION_MS, RETENTION_BATCH } from "@/lib/photoRetention";

const U = "11111111-1111-1111-1111-111111111111";
const J = "22222222-2222-2222-2222-222222222222";
const R = "33333333-3333-3333-3333-333333333333";
const NOW = Date.UTC(2026, 10, 8, 21, 10, 0); // inside the 21:00 UTC window
const DAY = 24 * 60 * 60_000;

type Obj = { bucket_id: string; name: string; created_at: string };
let store: Obj[] = [];
let rpcCalls: any[] = [];
let removeCalls: { bucket: string; names: string[] }[] = [];
let failRemove: Record<string, number> = {};
let failList = false;
const put = (bucket_id: string, name: string, ageDays: number) => store.push({ bucket_id, name, created_at: new Date(NOW - ageDays * DAY).toISOString() });
const db: any = {
  rpc: async (fn: string, args: any) => {
    rpcCalls.push({ fn, args });
    if (failList) return { data: null, error: { message: "db down" } };
    return { data: store.filter((o) => o.created_at < args.p_before).slice(0, args.p_limit), error: null };
  },
  storage: {
    from: (bucket: string) => ({
      remove: async (names: string[]) => {
        removeCalls.push({ bucket, names });
        if (failRemove[bucket]) { failRemove[bucket]--; return { data: null, error: { message: "storage 503" } }; }
        const gone = store.filter((o) => o.bucket_id === bucket && names.includes(o.name));
        store = store.filter((o) => !gone.includes(o));
        return { data: gone, error: null };
      },
    }),
  },
};

beforeEach(() => {
  store = []; rpcCalls = []; removeCalls = []; failRemove = {}; failList = false;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const OLD_FRAME = `${J}/1700000000000.jpg`;
const OLD_SELFIE = `${U}/1700000000000-ab12cd34.jpg`;
const OLD_CANCEL = `${U}/cancel/${J}/${R}.jpg`;

// Fix lane D7 item 6 (founder Q133): photos AND videos from trips go after 30 days: cancel proof
// videos, ARE-YOU-SAFE check selfies and practice-run proofs join D6's three kinds.
const OLD_VIDEO = `${U}/cancel/${J}/${R}.mp4`;
const OLD_CHECK = `${U}/challenge-${J}-1700000000000.jpg`;
const OLD_SIM_PHOTO = `simulation/${U}/${R}.jpg`;
const OLD_SIM_VIDEO = `simulation/${U}/${J}.mp4`;

test("deletes trip photos and videos older than 30 days; keeps the profile photo, younger files and other buckets", async () => {
  put("frames", OLD_FRAME, 31);
  put("selfies", OLD_SELFIE, 31);
  put("selfies", OLD_CANCEL, 31);
  put("selfies", OLD_VIDEO, 31);
  put("selfies", OLD_CHECK, 31);
  put("selfies", OLD_SIM_PHOTO, 31);
  put("selfies", OLD_SIM_VIDEO, 31);
  put("frames", `${J}/1800000000000.jpg`, 29); // 29 days: kept
  put("selfies", `${U}/cancel/${J}/${U}.mp4`, 29); // 29-day video: kept
  put("selfies", `${U}/challenge-${J}-1800000000000.jpg`, 29); // 29-day check selfie: kept
  put("selfies", `simulation/${U}/${U}.mp4`, 29); // 29-day practice proof: kept
  put("selfies", `${U}/profile.jpg`, 400); // profile photo: kept
  put("recordings", `${J}/clip.mp4`, 31); // recordings bucket (audio): unchanged, kept
  const res = await photoRetentionTick(NOW, db);
  expect(rpcCalls).toEqual([{ fn: "photo_retention_candidates", args: { p_before: new Date(NOW - PHOTO_RETENTION_MS).toISOString(), p_limit: RETENTION_BATCH } }]);
  expect(removeCalls).toEqual([
    { bucket: "frames", names: [OLD_FRAME] },
    { bucket: "selfies", names: [OLD_SELFIE, OLD_CANCEL, OLD_VIDEO, OLD_CHECK, OLD_SIM_PHOTO, OLD_SIM_VIDEO] },
  ]);
  expect(res).toEqual({ listed: 9, deleted: 7, failed: 0 });
  expect(store.map((o) => o.name).sort()).toEqual([
    `${J}/1800000000000.jpg`, `${J}/clip.mp4`, `${U}/cancel/${J}/${U}.mp4`, `${U}/challenge-${J}-1800000000000.jpg`, `simulation/${U}/${U}.mp4`, `${U}/profile.jpg`,
  ].sort());
});

test("near-miss names are never targets: other extensions, other folders, wrong bucket", () => {
  for (const n of [`${U}/cancel/${J}/${R}.mov`, `${U}/challenge-${J}-x.jpg`, `simulation/${U}/${R}.png`, `simulation/${U}/sub/${R}.jpg`, `${U}/simulation/${R}.jpg`, `${U}/profile.mp4`])
    expect(isRetentionTarget("selfies", n)).toBe(false);
  expect(isRetentionTarget("frames", OLD_VIDEO)).toBe(false);
  expect(isRetentionTarget("recordings", `${J}/clip.mp4`)).toBe(false);
});

test("a row the database wrongly lists as old is still not deleted when it is under 30 days", async () => {
  const wrongDb = { ...db, rpc: async () => ({ data: [{ bucket_id: "frames", name: OLD_FRAME, created_at: new Date(NOW - 29 * DAY).toISOString() }], error: null }) };
  const res = await photoRetentionTick(NOW, wrongDb);
  expect(removeCalls).toEqual([]);
  expect(res.deleted).toBe(0);
});

test("profile photo is never a target, whatever its age", () => {
  expect(isRetentionTarget("selfies", `${U}/profile.jpg`)).toBe(false);
  expect(isRetentionTarget("frames", `${U}/profile.jpg`)).toBe(false);
  expect(isRetentionTarget("selfies", OLD_SELFIE)).toBe(true);
  expect(isRetentionTarget("frames", OLD_SELFIE)).toBe(false); // right shape, wrong bucket
});

test("a second run deletes nothing twice", async () => {
  put("frames", OLD_FRAME, 31);
  put("selfies", OLD_SELFIE, 31);
  expect((await photoRetentionTick(NOW, db)).deleted).toBe(2);
  removeCalls = [];
  expect(await photoRetentionTick(NOW + 30_000, db)).toEqual({ listed: 0, deleted: 0, failed: 0 });
  expect(removeCalls).toEqual([]);
});

test("a failed delete is logged, the other bucket still goes, and the next run retries", async () => {
  put("frames", OLD_FRAME, 31);
  put("selfies", OLD_SELFIE, 31);
  failRemove.frames = 1;
  const first = await photoRetentionTick(NOW, db);
  expect(first).toEqual({ listed: 2, deleted: 1, failed: 1 });
  expect(console.error).toHaveBeenCalledWith("[photoRetention] delete failed", "frames", 1, "storage 503");
  const second = await photoRetentionTick(NOW + 30_000, db);
  expect(second).toEqual({ listed: 1, deleted: 1, failed: 0 });
  expect(store).toEqual([]);
});

test("a failed list is logged and nothing is deleted", async () => {
  put("frames", OLD_FRAME, 31);
  failList = true;
  expect(await photoRetentionTick(NOW, db)).toEqual({ listed: 0, deleted: 0, failed: 1 });
  expect(console.error).toHaveBeenCalledWith("[photoRetention] list failed", "db down");
  expect(removeCalls).toEqual([]);
});

test("outside the daily hour it does not touch the database", async () => {
  put("frames", OLD_FRAME, 31);
  const res = await photoRetentionTick(Date.UTC(2026, 10, 8, 20, 59, 59), db);
  expect(res.skipped).toBe(true);
  expect(rpcCalls).toEqual([]);
  expect(store).toHaveLength(1);
});

test("the deadman tick still answers when photo deletion throws", async () => {
  jest.resetModules();
  jest.doMock("@/lib/supabaseAdmin", () => ({
    admin: () => ({
      rpc: async (fn: string) => {
        if (fn === "photo_retention_candidates") throw new Error("network down");
        return { data: [], error: null };
      },
      from: () => { throw new Error("unused"); },
    }),
  }));
  jest.doMock("@/lib/cancelRetry", () => ({ cancelRetryTick: async () => ({ resent: 0, cycled: 0 }) }));
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  process.env.CRON_SECRET = "s";
  const { GET } = require("@/app/api/cron/deadman/route");
  const res = await GET(new Request("http://x/api/cron/deadman", { headers: { authorization: "Bearer s" } }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ checked: 0, photos: { deleted: 0, failed: 1 } });
  expect(console.error).toHaveBeenCalledWith("[deadman] photo retention failed", "network down");
  delete process.env.CRON_SECRET;
});
