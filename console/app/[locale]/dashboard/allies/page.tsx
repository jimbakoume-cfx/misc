import { getLocale, getTranslations } from "next-intl/server";
import { Chip } from "@/components/ui/chip";
import { Avatar, Pager } from "@/components/ui/controls";
import { FilterBar } from "@/components/ui/filters";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { allyName, cityName, getCities, getTiers, listAllies } from "@/lib/data";
import { num } from "@/lib/format";
import { allyStateTone, one, qs, type Search } from "@/lib/tones";

const STATES = ["on_trip", "available", "on_break", "off_shift", "suspended", "left"];

export default async function AlliesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations("console.allies");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const [cities, tiers] = await Promise.all([getCities(), getTiers()]);
  const page = await listAllies({ q: one(sp.q), city: one(sp.city), tier: one(sp.tier), rating: one(sp.rating), activity: one(sp.activity), trips: one(sp.trips), page: Number(one(sp.page) ?? 1) });

  const cols = [
    { key: "check", label: "", width: "var(--ally-check)" },
    { key: "ally", label: t("cols.ally"), width: "minmax(var(--ally-ally), 1fr)" },
    { key: "badge", label: t("cols.badge"), width: "var(--ally-badge)" },
    { key: "phone", label: t("cols.phone"), width: "var(--ally-phone)" },
    { key: "city", label: t("cols.city"), width: "var(--ally-city)" },
    { key: "tier", label: t("cols.tier"), width: "var(--ally-tier)" },
    { key: "rating", label: t("cols.rating"), width: "var(--ally-rating)", align: "right" as const },
    { key: "state", label: t("cols.state"), width: "var(--ally-state)" },
    { key: "trips", label: t("cols.trips"), width: "var(--ally-trips)", align: "right" as const },
  ];

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("count", { n: page.total })} />
      <FilterBar
        fields={[
          { kind: "search", name: "q", width: "var(--af-search)", placeholder: t("search") },
          { kind: "select", name: "city", width: "var(--af-city)", label: t("anyCity"), options: cities.map((c) => ({ value: c.id, label: c.name })) },
          { kind: "select", name: "tier", width: "var(--af-tier)", label: t("anyTier"), options: tiers.map((x) => ({ value: x.code, label: x.name })) },
          { kind: "select", name: "rating", width: "var(--af-rating)", label: t("anyRating"), options: [{ value: "gte4.8", label: "≥ 4,8" }, { value: "lt4.5", label: "< 4,5" }] },
          { kind: "select", name: "activity", width: "var(--af-activity)", label: t("anyActivity"), options: STATES.map((s) => ({ value: s, label: e(`allyState.${s}`) })) },
          { kind: "select", name: "trips", width: "var(--af-trips)", label: t("anyTrips"), options: [{ value: "none", label: t("noTripsThisMonth") }, { value: "gt100", label: t("over100") }] },
        ]}
      />
      <Table columns={cols} empty={t("empty")} footer={<Pager page={page.page} pageSize={page.pageSize} total={page.total} hrefFor={(p) => `/dashboard/allies${qs(sp, { page: p })}`} label={t("count", { n: page.total })} />}>
        {page.rows.map((a) => (
          <Row key={a.id} href={`/dashboard/allies/${a.id}`} style={{ minHeight: "var(--ally-row-h)" }}>
            <Cell><Avatar name={allyName(a)} size={28} /></Cell>
            <Cell sub={e(`allyRole.${a.role}`)}><span className="block truncate" style={{ fontWeight: 500 }}>{allyName(a)}</span></Cell>
            <Cell label={t("cols.badge")} mono>{a.badge}</Cell>
            <Cell label={t("cols.phone")}>{a.phone}</Cell>
            <Cell label={t("cols.city")}>{cityName(a.cityId)}</Cell>
            <Cell label={t("cols.tier")}>{tiers.find((x) => x.code === a.tier)?.name}</Cell>
            <Cell label={t("cols.rating")} align="right"><span style={{ color: a.rating < 4.5 ? "var(--warn)" : undefined }}>★ {num(a.rating, locale, 2)}</span></Cell>
            <Cell label={t("cols.state")}>
              <span className="inline-flex flex-wrap gap-1">
                <Chip tone={allyStateTone[a.state]} dot>{e(`allyState.${a.state}`)}</Chip>
                {a.fatigueOpen && <Chip tone="danger">{t("fatigue")}</Chip>}
              </span>
            </Cell>
            <Cell label={t("cols.trips")} align="right" sub={t("thisMonth", { n: a.tripsThisMonth })}>{num(a.trips, locale)}</Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
