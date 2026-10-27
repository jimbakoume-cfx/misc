import { getLocale, getTranslations } from "next-intl/server";
import { Chip } from "@/components/ui/chip";
import { FilterBar } from "@/components/ui/filters";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { cityName, getCities, getTiers, listVehicles } from "@/lib/data";
import { daysFromNow, num } from "@/lib/format";
import { one, roadTone, type Search } from "@/lib/tones";
import type { Paper } from "@/lib/data";

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations("console.vehicles");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const [cities, tiers] = await Promise.all([getCities(), getTiers()]);
  const rows = await listVehicles({ q: one(sp.q), city: one(sp.city), tier: one(sp.tier), road: one(sp.road), papers: one(sp.papers) });

  const papers = (ps: Paper[]) => {
    const due = ps.map((p) => ({ p, d: daysFromNow(p.expiresAt) })).filter((x) => x.d < 30).sort((a, b) => a.d - b.d);
    if (!due.length) return <Chip tone="good">{t("papersOk")}</Chip>;
    return (
      <span className="inline-flex flex-wrap gap-1">
        {due.map(({ p, d }) => (
          <Chip key={p.kind} tone={d < 0 ? "danger" : "warn"}>
            {e(`docKind.${p.kind}`)} {d < 0 ? t("expired") : t("inDays", { n: d })}
          </Chip>
        ))}
      </span>
    );
  };

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("count", { n: rows.length })} />
      <FilterBar
        fields={[
          { kind: "search", name: "q", width: "var(--af-search)", placeholder: t("search") },
          { kind: "select", name: "city", width: "var(--af-city)", label: t("anyCity"), options: cities.map((c) => ({ value: c.id, label: c.name })) },
          { kind: "select", name: "tier", width: "var(--af-tier)", label: t("anyTier"), options: tiers.map((x) => ({ value: x.code, label: x.name })) },
          { kind: "select", name: "road", width: "var(--af-activity)", label: t("anyRoad"), options: ["on_road", "off_road", "in_preparation", "left_fleet"].map((v) => ({ value: v, label: e(`road.${v}`) })) },
          { kind: "select", name: "papers", width: "var(--af-rating)", label: t("anyPapers"), options: [{ value: "attention", label: t("papersDue") }] },
        ]}
      />
      <Table
        columns={[
          { key: "plate", label: t("cols.plate"), width: "var(--fleet-plate)" },
          { key: "model", label: t("cols.model"), width: "minmax(150px,1fr)" },
          { key: "class", label: t("cols.class"), width: "var(--fleet-class)" },
          { key: "papers", label: t("cols.papers"), width: "var(--fleet-papers)" },
          { key: "road", label: t("cols.road"), width: "var(--fleet-road)" },
          { key: "odo", label: t("cols.odometer"), width: "var(--fleet-action)", align: "right" },
        ]}
        empty={t("empty")}
      >
        {rows.map((v) => (
          <Row key={v.id} href={`/dashboard/vehicles/${v.id}`}>
            <Cell><span className="font-mono" style={{ fontSize: "var(--fs-plate)", fontWeight: 500 }}>{v.plate}</span></Cell>
            <Cell sub={`${v.year} · ${v.colour} · ${cityName(v.cityId)}`}>{v.make} {v.model}</Cell>
            <Cell label={t("cols.class")}>{tiers.find((x) => x.code === v.tier)?.name}</Cell>
            <Cell label={t("cols.papers")}>{papers(v.papers)}</Cell>
            <Cell label={t("cols.road")}><Chip tone={roadTone[v.road]} dot>{e(`road.${v.road}`)}</Chip></Cell>
            <Cell label={t("cols.odometer")} align="right">{num(v.odometer, locale)} km</Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
