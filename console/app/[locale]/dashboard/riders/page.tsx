import { getLocale, getTranslations } from "next-intl/server";
import { Chip } from "@/components/ui/chip";
import { Pager } from "@/components/ui/controls";
import { FilterBar } from "@/components/ui/filters";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { cityName, getCities, listRiders, riderName } from "@/lib/data";
import { date, money, relative } from "@/lib/format";
import { identityTone, one, qs, riderStatusTone, type Search } from "@/lib/tones";

export default async function RidersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations("console.riders");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const cities = await getCities();
  const page = await listRiders({ q: one(sp.q), city: one(sp.city), loyalty: one(sp.loyalty), identity: one(sp.identity), status: one(sp.status), page: Number(one(sp.page) ?? 1) });

  const cols = [
    { key: "rider", label: t("cols.rider"), width: "minmax(var(--rdr-rider), 1fr)" },
    { key: "member", label: t("cols.member"), width: "var(--rdr-member)" },
    { key: "phone", label: t("cols.phone"), width: "var(--rdr-phone)" },
    { key: "loyalty", label: t("cols.loyalty"), width: "var(--rdr-loyalty)" },
    { key: "city", label: t("cols.city"), width: "var(--rdr-city)" },
    { key: "identity", label: t("cols.identity"), width: "var(--rdr-identity)" },
    { key: "trips", label: t("cols.trips"), width: "var(--rdr-trips)", align: "right" as const },
    { key: "wallet", label: t("cols.wallet"), width: "var(--rdr-wallet)", align: "right" as const },
    { key: "last", label: t("cols.lastTrip"), width: "var(--rdr-lasttrip)" },
  ];

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("count", { n: page.total })} />
      <FilterBar
        fields={[
          { kind: "search", name: "q", width: "var(--af-search)", placeholder: t("search") },
          { kind: "select", name: "city", width: "var(--af-city)", label: t("anyCity"), options: cities.map((c) => ({ value: c.id, label: c.name })) },
          { kind: "select", name: "loyalty", width: "var(--af-tier)", label: t("anyLoyalty"), options: ["none", "silver", "gold", "platinum"].map((v) => ({ value: v, label: e(`loyalty.${v}`) })) },
          { kind: "select", name: "identity", width: "var(--af-rating)", label: t("anyIdentity"), options: ["verified", "pending", "unverified", "rejected"].map((v) => ({ value: v, label: e(`identity.${v}`) })) },
          { kind: "select", name: "status", width: "var(--af-activity)", label: t("anyStatus"), options: ["active", "deactivated", "blacklisted"].map((v) => ({ value: v, label: e(`riderStatus.${v}`) })) },
        ]}
      />
      <Table columns={cols} empty={t("empty")} footer={<Pager page={page.page} pageSize={page.pageSize} total={page.total} hrefFor={(p) => `/dashboard/riders${qs(sp, { page: p })}`} label={t("count", { n: page.total })} />}>
        {page.rows.map((r) => (
          <Row key={r.id} href={`/dashboard/riders/${r.id}`}>
            <Cell sub={r.status !== "active" ? <Chip tone={riderStatusTone[r.status]}>{e(`riderStatus.${r.status}`)}</Chip> : r.email ?? undefined}>
              <span className="block truncate" style={{ fontWeight: 500 }}>{riderName(r)}</span>
            </Cell>
            <Cell label={t("cols.member")}>{date(r.memberSince, locale).replace(/^\d+\s/, "")}</Cell>
            <Cell label={t("cols.phone")}>{r.phone}</Cell>
            <Cell label={t("cols.loyalty")}>{r.loyalty === "none" ? <span style={{ color: "var(--faint)" }}>—</span> : <Chip tone={r.loyalty === "platinum" ? "navy" : "neutral"}>{e(`loyalty.${r.loyalty}`)}</Chip>}</Cell>
            <Cell label={t("cols.city")}>{cityName(r.cityId)}</Cell>
            <Cell label={t("cols.identity")}><Chip tone={identityTone[r.identity]}>{e(`identity.${r.identity}`)}</Chip></Cell>
            <Cell label={t("cols.trips")} align="right">{r.trips}</Cell>
            <Cell label={t("cols.wallet")} align="right"><span style={{ color: r.wallet < 0 ? "var(--danger)" : undefined }}>{money(r.wallet, locale)}</span></Cell>
            <Cell label={t("cols.lastTrip")}>{r.lastTripAt ? relative(r.lastTripAt, locale) : "—"}</Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
