import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Card, CardHead, Notice } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CopyId } from "@/components/ui/copy-id";
import { Avatar, KeyValues } from "@/components/ui/controls";
import { Tile, Tiles } from "@/components/ui/figures";
import { Blocks, PageHeader, Section } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { cityName, getRider, listTrips, lookupCompany, riderName } from "@/lib/data";
import { date, dateTime, money } from "@/lib/format";
import { identityTone, paymentStateTone, riderStatusTone, tripStatusTone } from "@/lib/tones";

export default async function RiderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRider(id);
  if (!r) notFound();
  const t = await getTranslations("console.rider");
  const e = await getTranslations("console.enums");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const company = lookupCompany(r.companyId);
  const trips = (await listTrips({ q: r.phone })).rows;
  const spend = trips.reduce((s, x) => s + x.charged, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/riders", label: c("backToRiders") }}
        eyebrow={`${cityName(r.cityId)} · ${t("since", { date: date(r.memberSince, locale) })}`}
        title={<span className="inline-flex items-center gap-3"><Avatar name={riderName(r)} size={40} /> {riderName(r)} <Chip tone={riderStatusTone[r.status]}>{e(`riderStatus.${r.status}`)}</Chip></span>}
        sub={<CopyId id={r.id} />}
        actions={
          <>
            <ActionButton>{t("credit")}</ActionButton>
            {r.identity === "pending" && <ActionButton variant="good">{t("verify")}</ActionButton>}
            {r.status === "active" ? <ActionButton variant="danger" confirm={t("deactivateConfirm")}>{t("deactivate")}</ActionButton> : <ActionButton>{t("reactivate")}</ActionButton>}
          </>
        }
      />
      {r.wallet < 0 && (
        <Section>
          <Notice tone="danger" label={t("debtLabel")}>{t("debtBody", { amount: money(-r.wallet, locale) })}</Notice>
        </Section>
      )}
      <Tiles>
        <Tile label={t("wallet")} figure={money(r.wallet, locale)} tone={r.wallet < 0 ? "danger" : undefined} />
        <Tile label={t("trips")} figure={r.trips} />
        <Tile label={t("loyalty")} figure={e(`loyalty.${r.loyalty}`)} />
        <Tile label={t("recentSpend")} figure={money(spend, locale)} sub={t("recentSpendSub", { n: trips.length })} />
      </Tiles>
      <Blocks>
        <Table
          columns={[
            { key: "when", label: t("cols.when"), width: "var(--trip-when)" },
            { key: "trip", label: t("cols.trip"), width: "var(--trip-trip)" },
            { key: "route", label: t("cols.route"), width: "minmax(0,1fr)" },
            { key: "status", label: t("cols.status"), width: "var(--trip-status)" },
            { key: "charged", label: t("cols.charged"), width: "var(--trip-charged)", align: "right" },
            { key: "payment", label: t("cols.payment"), width: "var(--trip-payment)" },
          ]}
          empty={t("noTrips")}
        >
          {trips.map((trip) => (
            <Row key={trip.id} href={`/dashboard/trips/${trip.id}`}>
              <Cell>{dateTime(trip.requestedAt, locale)}</Cell>
              <Cell mono>{trip.ref}</Cell>
              <Cell><span className="block truncate">{trip.pickup} → {trip.dropoff}</span></Cell>
              <Cell><Chip tone={tripStatusTone[trip.status]}>{e(`tripStatus.${trip.status}`)}</Chip></Cell>
              <Cell align="right">{trip.charged ? money(trip.charged, locale) : "—"}</Cell>
              <Cell><Chip tone={paymentStateTone[trip.paymentState]}>{e(`payment.${trip.payment}`)}</Chip></Cell>
            </Row>
          ))}
        </Table>
        <div className="min-w-0 space-y-[var(--card-gap)]">
          <Card>
            <CardHead title={t("profile")} />
            <KeyValues
              rows={[
                [t("phone"), r.phone],
                [t("email"), r.email ?? "—"],
                [t("identity"), <Chip key="i" tone={identityTone[r.identity]}>{e(`identity.${r.identity}`)}</Chip>],
                [t("company"), company ? <Link key="c" href={`/dashboard/companies/${company.id}`} className="hover:underline" style={{ color: "var(--green)" }}>{company.name}</Link> : "—"],
              ]}
            />
          </Card>
        </div>
      </Blocks>
    </>
  );
}
