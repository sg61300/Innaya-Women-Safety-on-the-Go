import { notFound } from "next/navigation";
import { readFileSync } from "fs";
import path from "path";
import { GuardianStatus, type GuardianData } from "../../[token]/GuardianStatus";

// Dev-only harness for rendering the guardian view from a JSON fixture, so
// states that need mocked data (EMERGENCY / CRITICAL) can be reviewed and
// screenshotted without touching the database. Returns 404 in production, so
// it never reaches a real guardian.
export const dynamic = "force-dynamic";

type Fixture = {
  name: string;
  phone: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  state: string;
  archived: boolean;
  live: boolean;
  battery: number | null;
  lat: number | null;
  lng: number | null;
  locOffsetSec: number | null;
  lastContactOffsetSec: number | null;
  frameUrls: string[];
  frameOffsetsSec: number[];
  history: { state: string; offsetSec: number }[];
  mapEmbedSrc: string | null;
};

const iso = (offsetSec: number) => new Date(Date.now() + offsetSec * 1000).toISOString();

export default async function FixturePage({ params }: { params: Promise<{ name: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { name } = await params;
  if (!/^[a-z0-9_-]+$/i.test(name)) notFound();

  let fx: Fixture;
  try {
    fx = JSON.parse(readFileSync(path.join(process.cwd(), "src/app/g/fixture/_data", `${name}.json`), "utf8"));
  } catch {
    notFound();
  }

  const data: GuardianData = {
    name: fx.name,
    phone: fx.phone,
    fromLabel: fx.fromLabel,
    toLabel: fx.toLabel,
    state: fx.state,
    archived: fx.archived,
    live: fx.live,
    loc: fx.lat != null && fx.lng != null ? { lat: fx.lat, lng: fx.lng, ts: iso(fx.locOffsetSec ?? -20) } : null,
    battery: fx.battery,
    lastContactTs: fx.lastContactOffsetSec != null ? iso(fx.lastContactOffsetSec) : null,
    frames: fx.frameUrls.map((url, i) => ({ url, ts: iso(fx.frameOffsetsSec[i] ?? -(i + 1) * 3) })),
    frameError: false,
    history: fx.history.map((h) => ({ state: h.state, changedAt: iso(h.offsetSec) })),
    mapEmbedSrc: fx.mapEmbedSrc,
    mapLink: fx.lat != null && fx.lng != null ? `https://maps.google.com/?q=${fx.lat},${fx.lng}` : null,
  };

  return <GuardianStatus data={data} />;
}
