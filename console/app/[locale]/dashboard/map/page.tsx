import { getTranslations } from "next-intl/server";
import { Card, CardHead } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/controls";
import { Blocks, PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { getCities, getMapPoints } from "@/lib/data";
import { allyStateTone, one, type Search } from "@/lib/tones";

const COLORS: Record<string, string> = { on_trip: "var(--green)", available: "var(--navy)", on_break: "var(--warn)" };

// The live console draws this on Mapbox. Here the positions are plotted on a plain canvas around the city's
// centre, so the page works without a map token; swap <FleetCanvas> for a Mapbox/MapLibre map when you have one.
export default async function MapPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations("console.map");
  const e = await getTranslations("console.enums");
  const cities = await getCities();
  const city = cities.find((c) => c.id === one(sp.city)) ?? cities.find((c) => c.isDefault) ?? cities[0];
  const points = await getMapPoints(city.id);
  const span = 0.1;
  const x = (lng: number) => ((lng - (city.lng - span / 2)) / span) * 100;
  const y = (lat: number) => (1 - (lat - (city.lat - span / 2)) / span) * 100;

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub", { n: points.length })} />
      <Tabs active={city.id} items={cities.map((c) => ({ key: c.id, label: c.name, href: `/dashboard/map?city=${c.id}` }))} />
      <Blocks>
        <Card style={{ overflow: "hidden" }}>
          <div className="relative w-full" style={{ aspectRatio: "16 / 10", background: "var(--map)" }}>
            <svg className="absolute inset-0 h-full w-full" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => (
                <g key={i} stroke="#ffffff" strokeWidth="1">
                  <line x1={`${(i + 1) * 10}%`} y1="0" x2={`${(i + 1) * 10}%`} y2="100%" />
                  <line x1="0" y1={`${(i + 1) * 10}%`} x2="100%" y2={`${(i + 1) * 10}%`} />
                </g>
              ))}
            </svg>
            <span className="absolute font-label uppercase" style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)", letterSpacing: 4, color: "var(--faint)", fontSize: 12 }}>{city.name}</span>
            {points.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/allies/${p.id}`}
                title={`${p.name} · ${p.plate} · ${e(`allyState.${p.state}`)}`}
                className={`absolute ${p.sos ? "marker-pulse" : ""}`}
                style={{ left: `${x(p.lng)}%`, top: `${y(p.lat)}%`, width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: 99, background: p.sos ? "var(--danger)" : COLORS[p.state], border: "2px solid white", boxShadow: "0 1px 3px rgba(8,25,81,.35)" }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-4" style={{ padding: "var(--band-pad)", fontSize: "var(--fs-caption)", color: "var(--muted2)" }}>
            {Object.entries(COLORS).map(([k, c]) => (
              <span key={k} className="inline-flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 99, background: c }} />{e(`allyState.${k}`)}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 99, background: "var(--danger)" }} />SOS</span>
          </div>
        </Card>
        <Card className="max-h-[70vh] overflow-y-auto">
          <CardHead title={t("onDuty")} />
          {points.map((p) => (
            <Link key={p.id} href={`/dashboard/allies/${p.id}`} className="row-link flex items-center justify-between gap-2 transition-colors" style={{ padding: "var(--queue-row-pad)", borderBottom: "1px solid var(--hairline)" }}>
              <span className="min-w-0">
                <span className="block truncate">{p.name}</span>
                <span className="font-mono" style={{ fontSize: "var(--fs-mono)", color: "var(--muted2)" }}>{p.plate}</span>
              </span>
              <Chip tone={p.sos ? "danger" : allyStateTone[p.state]}>{p.sos ? "SOS" : e(`allyState.${p.state}`)}</Chip>
            </Link>
          ))}
        </Card>
      </Blocks>
    </>
  );
}
