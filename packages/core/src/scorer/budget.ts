import type { ProviderId } from './types';

interface Limit { rpm: number; rpd: number }

interface Meter {
  window: number[]; // call timestamps within the last 60s (rpm)
  dayCount: number; // calls since dayStart (rpd)
  dayStart: number; // ms-floor of the current UTC day
  backoffUntil: number;
}

const DAY = 86_400_000;
const MINUTE = 60_000;
// A provider is skipped once it reaches 90% of a limit, leaving headroom so a
// concurrent burst never trips the provider's own hard 429.
const HEADROOM = 0.9;

export class ProviderBudget {
  private limits: Record<string, Limit>;
  private now: () => number;
  private meters = new Map<ProviderId, Meter>();

  constructor(limits: Record<ProviderId, Limit>, now: () => number = () => Date.now()) {
    this.limits = { ...limits };
    this.now = now;
  }

  private meter(p: ProviderId): Meter {
    let m = this.meters.get(p);
    if (!m) {
      m = { window: [], dayCount: 0, dayStart: Math.floor(this.now() / DAY) * DAY, backoffUntil: 0 };
      this.meters.set(p, m);
    }
    return m;
  }

  private prune(m: Meter): void {
    const t = this.now();
    const cutoff = t - MINUTE;
    while (m.window.length && m.window[0] <= cutoff) m.window.shift();
    const day = Math.floor(t / DAY) * DAY;
    if (day !== m.dayStart) {
      m.dayStart = day;
      m.dayCount = 0;
    }
  }

  canCall(p: ProviderId): boolean {
    const lim = this.limits[p];
    if (!lim) return false; // unknown/unconfigured provider is never called
    const m = this.meter(p);
    this.prune(m);
    if (m.backoffUntil > this.now()) return false;
    if (m.window.length >= HEADROOM * lim.rpm) return false;
    if (m.dayCount >= HEADROOM * lim.rpd) return false;
    return true;
  }

  record(p: ProviderId): void {
    const m = this.meter(p);
    this.prune(m);
    const t = this.now();
    m.window.push(t);
    m.dayCount += 1;
  }

  backoff(p: ProviderId, ms: number): void {
    const m = this.meter(p);
    m.backoffUntil = this.now() + ms;
  }
}
