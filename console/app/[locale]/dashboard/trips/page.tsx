import { getLocale, getTranslations } from "next-intl/server";
import { Chip } from "@/components/ui/chip";
import { Pager } from "@/components/ui/controls";
import { FilterBar } from "@/components/ui/filters";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { allyName, cityName, getTiers, listTrips, lookupAlly, lookupRider, riderName } from "@/lib/data";
import { dateTime, money } from "@/lib/format";
import { one, paymentStateTone, qs, tripStatusTone, type Search } from "@/lib/tones";

const STATUSES = ["live", "searching", "assigned", "arriving", "in_progress", "completed", "cancelled", "no_car"];
const TYPES = ["ride", "airport", "rental", "company"];

export default async function TripsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations("console.trips");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const tiers = await getTiers();
  const page = await listTrips({ q: one(sp.q), status: one(sp.status), type: one(sp.type), tier: one(sp.tier), fare: one(sp.fare), from: one(sp.from), to: one(sp.to), page: Number(one(sp.page) ?? 1) });

  const cols = [
    { key: "when", label: t("cols.when"), width: "var(--trip-when)" },
    { key: "trip", label: t("cols.trip"), width: "var(--trip-trip)" },
    { key: "route", label: t("cols.route"), width: "minmax(0,1fr)" },
    { key: "status", label: t("cols.status"), width: "var(--trip-status)" },
    { key: "type", label: t("cols.type"), width: "var(--trip-type)" },
    { key: "tier", label: t("cols.tier"), width: "var(--trip-tier)" },
    { key: "ally", label: t("cols.ally"), width: "var(--trip-ally)" },
    { key: "charged", label: t("cols.charged"), width: "var(--trip-charged)", align: "right" as const },
    { key: "payment", label: t("cols.payment"), width: "var(--trip-payment)" },
  ];

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("count", { n: page.total })} />
      <FilterBar
        fields={[
          { kind: "search", name: "q", width: "var(--tf-search)", placeholder: t("search") },
          { kind: "select", name: "status", width: "var(--tf-status)", label: t("anyStatus"), options: STATUSES.map((s) => ({ value: s, label: s === "live" ? t("live") : e(`tripStatus.${s}`) })) },
          { kind: "select", name: "type", width: "var(--tf-type)", label: t("anyType"), options: TYPES.map((s) => ({ value: s, label: e(`tripType.${s}`) })) },
          { kind: "select", name: "tier", width: "var(--tf-tier)", label: t("anyTier"), options: tiers.map((x) => ({ value: x.code, label: x.name })) },
          { kind: "select", name: "fare", width: "var(--tf-fare)", label: t("anyFare"), options: [{ value: "lt5k", label: "< 5 000" }, { value: "5k-15k", label: "5 000 – 15 000" }, { value: "gt15k", label: "> 15 000" }] },
          { kind: "dates", width: "var(--tf-date)" },
        ]}
      />
      <Table
        columns={cols}
        empty={t("empty")}
        footer={<Pager page={page.page} pageSize={page.pageSize} total={page.total} hrefFor={(p) => `/dashboard/trips${qs(sp, { page: p })}`} label={t("showing", { from: (page.page - 1) * page.pageSize + (page.rows.length ? 1 : 0), to: (page.page - 1) * page.pageSize + page.rows.length, total: page.total })} />}
      >
        {page.rows.map((trip) => {
          const ally = lookupAlly(trip.allyId);
          const rider = lookupRider(trip.riderId);
          return (
            <Row key={trip.id} href={`/dashboard/trips/${trip.id}`} highlight={trip.status === "searching"}>
              <Cell label={t("cols.when")} sub={cityName(trip.cityId)}>{dateTime(trip.requestedAt, locale)}</Cell>
              <Cell label={t("cols.trip")} mono>{trip.ref}</Cell>
              <Cell label={t("cols.route")} sub={rider ? riderName(rider) : undefined}>
                <span className="block truncate">{trip.pickup} → {trip.dropoff}</span>
              </Cell>
              <Cell label={t("cols.status")}><Chip tone={tripStatusTone[trip.status]}>{e(`tripStatus.${trip.status}`)}</Chip></Cell>
              <Cell label={t("cols.type")}>{e(`tripType.${trip.type}`)}</Cell>
              <Cell label={t("cols.tier")}>{tiers.find((x) => x.code === trip.tier)?.name}</Cell>
              <Cell label={t("cols.ally")}>{ally ? <span className="block truncate">{allyName(ally)}</span> : <span style={{ color: "var(--faint)" }}>—</span>}</Cell>
              <Cell label={t("cols.charged")} align="right">
                <span className="font-display" style={{ fontSize: "var(--fs-charged)" }}>{trip.charged ? money(trip.charged, locale) : "—"}</span>
              </Cell>
              <Cell label={t("cols.payment")} sub={<Chip tone={paymentStateTone[trip.paymentState]}>{e(`paymentState.${trip.paymentState}`)}</Chip>}>
                <span style={{ paddingLeft: "var(--trip-payment-gutter)" }}>{e(`payment.${trip.payment}`)}</span>
              </Cell>
            </Row>
          );
        })}
      </Table>
    </>
  );
}
