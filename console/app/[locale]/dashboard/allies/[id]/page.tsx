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
import { allyName, cityName, getAlly, getTiers, listDocuments, listTrips, lookupVehicle } from "@/lib/data";
import { date, dateTime, money, num, pct, relative } from "@/lib/format";
import { allyStateTone, docStateTone, tripStatusTone } from "@/lib/tones";

export default async function AllyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ally = await getAlly(id);
  if (!ally) notFound();
  const t = await getTranslations("console.ally");
  const e = await getTranslations("console.enums");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const tier = (await getTiers()).find((x) => x.code === ally.tier);
  const vehicle = lookupVehicle(ally.vehicleId);
  const trips = (await listTrips({ q: allyName(ally) })).rows.slice(0, 8);
  const docs = (await listDocuments("all", "ally")).filter((d) => d.whose.id === ally.id);

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/allies", label: c("backToDrivers") }}
        eyebrow={`${ally.badge} · ${cityName(ally.cityId)}`}
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={allyName(ally)} size={40} /> {allyName(ally)} <Chip tone={allyStateTone[ally.state]} dot>{e(`allyState.${ally.state}`)}</Chip>
          </span>
        }
        sub={<CopyId id={ally.id} />}
        actions={
          <>
            <ActionButton>{t("message")}</ActionButton>
            {ally.state === "suspended" ? <ActionButton variant="good">{t("reinstate")}</ActionButton> : <ActionButton variant="danger" confirm={t("suspendConfirm")}>{t("suspend")}</ActionButton>}
          </>
        }
      />
      {ally.fatigueOpen && (
        <Section>
          <Notice tone="danger" label={t("fatigueLabel")}>{t("fatigueBody")}</Notice>
        </Section>
      )}
      <Tiles>
        <Tile label={t("rating")} figure={`★ ${num(ally.rating, locale, 2)}`} />
        <Tile label={t("acceptance")} figure={pct(ally.acceptance, locale)} tone={ally.acceptance < 0.8 ? "warn" : undefined} />
        <Tile label={t("tripsMonth")} figure={ally.tripsThisMonth} sub={t("tripsTotal", { n: num(ally.trips, locale) })} />
        <Tile label={t("earnings")} figure={money(ally.earningsThisMonth, locale)} />
      </Tiles>
      <Blocks>
        <div className="min-w-0 space-y-[var(--section-gap)]">
          <Table
            columns={[
              { key: "when", label: t("cols.when"), width: "var(--trip-when)" },
              { key: "trip", label: t("cols.trip"), width: "var(--trip-trip)" },
              { key: "route", label: t("cols.route"), width: "minmax(0,1fr)" },
              { key: "status", label: t("cols.status"), width: "var(--trip-status)" },
              { key: "charged", label: t("cols.charged"), width: "var(--trip-charged)", align: "right" },
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
              </Row>
            ))}
          </Table>
          <Card>
            <CardHead title={t("documents")} />
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3" style={{ padding: "var(--list-row-pad)", borderBottom: "1px solid var(--hairline)" }}>
                <span>{e(`docKind.${d.which}`)} <span className="font-mono" style={{ fontSize: "var(--fs-mono)", color: "var(--muted2)" }}>{d.number}</span></span>
                <span className="flex items-center gap-3"><span style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)" }}>{date(d.expiresAt, locale)}</span><Chip tone={docStateTone[d.state]}>{e(`docState.${d.state}`)}</Chip></span>
              </div>
            ))}
          </Card>
        </div>
        <div className="min-w-0 space-y-[var(--card-gap)]">
          <Card>
            <CardHead title={t("profile")} />
            <KeyValues
              rows={[
                [t("phone"), ally.phone],
                [t("city"), cityName(ally.cityId)],
                [t("tier"), tier?.name],
                [t("role"), e(`allyRole.${ally.role}`)],
                [t("joined"), date(ally.joinedAt, locale)],
                [t("lastActive"), relative(ally.lastActiveAt, locale)],
              ]}
            />
          </Card>
          <Card>
            <CardHead title={t("vehicle")} />
            {vehicle ? (
              <KeyValues
                rows={[
                  [t("plate"), <Link key="v" href={`/dashboard/vehicles/${vehicle.id}`} className="font-mono hover:underline" style={{ color: "var(--green)" }}>{vehicle.plate}</Link>],
                  [t("model"), `${vehicle.make} ${vehicle.model} · ${vehicle.colour}`],
                  [t("pairedWith"), vehicle.allyIds.filter((x) => x !== ally.id).length ? t("pairCount", { n: vehicle.allyIds.length - 1 }) : "—"],
                ]}
              />
            ) : (
              <p style={{ padding: "var(--band-pad)", color: "var(--muted2)" }}>{t("noVehicle")}</p>
            )}
          </Card>
        </div>
      </Blocks>
    </>
  );
}
