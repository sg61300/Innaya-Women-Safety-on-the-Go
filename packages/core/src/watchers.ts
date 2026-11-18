export interface WatcherInput { id: string; tier: "primary"|"buffer"; response: "accept"|"decline"|null; respondedAt: number|null; lastSeenAt: number|null; }
export interface WatcherPlan { active: string[]; queued: string[]; requestBuffers: boolean; noneAvailable: boolean; }
export const REQUEST_WINDOW_MS = 180_000, INACTIVE_MS = 120_000, MAX_ACTIVE = 3;
export function assignWatchers(i: { contacts: WatcherInput[]; requestedAt: number; buffersRequestedAt: number|null; now: number }): WatcherPlan {
  const alive = (w: WatcherInput) => w.lastSeenAt !== null && i.now - w.lastSeenAt <= INACTIVE_MS;
  const accepted = i.contacts.filter(w => w.response === "accept").sort((a, b) => (a.respondedAt ?? 0) - (b.respondedAt ?? 0));
  const ordered = [...accepted.filter(w => w.tier === "primary"), ...accepted.filter(w => w.tier === "buffer")];
  const available = ordered.filter(alive);
  const active = available.slice(0, MAX_ACTIVE).map(w => w.id);
  const queued = available.slice(MAX_ACTIVE).map(w => w.id);
  const anyPrimaryAccepted = accepted.some(w => w.tier === "primary");
  const primaryWindowOver = i.now - i.requestedAt >= REQUEST_WINDOW_MS;
  const buffersNotRequested = i.buffersRequestedAt === null;
  const requestBuffers = buffersNotRequested && active.length === 0 && (primaryWindowOver || anyPrimaryAccepted);
  const noneAvailable = active.length === 0 && i.buffersRequestedAt !== null && i.now - i.buffersRequestedAt >= REQUEST_WINDOW_MS;
  return { active, queued, requestBuffers, noneAvailable };
}
