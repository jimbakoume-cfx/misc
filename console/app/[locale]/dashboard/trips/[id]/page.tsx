import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Card, CardHead, Notice } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CopyId } from "@/components/ui/copy-id";
import { KeyValues } from "@/components/ui/controls";
import { Blocks, PageHeader, Section } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { allyName, cityName, getTiers, getTrip, lookupAlly, lookupCompany, lookupRider, lookupVehicle, riderName } from "@/lib/data";
import { dateTime, money, num, time } from "@/lib/format";
import { paymentStateTone, tripStatusTone } from "@/lib/tones";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await getTrip(id);
  if (!trip) notFound();
  const t = await getTranslations("console.trip");
  const e = await getTranslations("console.enums");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const tier = (await getTiers()).find((x) => x.code === trip.tier);
  const ally = lookupAlly(trip.allyId);
  const rider = lookupRider(trip.riderId);
  const vehicle = lookupVehicle(ally?.vehicleId ?? null);
  const company = lookupCompany(trip.companyId);
  const live = ["searching", "assigned", "arriving", "in_progress"].includes(trip.status);
  const start = Date.parse(trip.requestedAt);
  const steps: [string, number][] = [
    ["requested", 0],
    ...(trip.allyId ? ([["assigned", 1 + (trip.waitMin > 6 ? 2 : 0)], ["arrived", trip.waitMin], ["started", trip.waitMin + 2]] as [string, number][]) : []),
    ...(trip.status === "completed" ? ([["completed", trip.waitMin + 2 + trip.durationMin]] as [string, number][]) : []),
    ...(trip.status === "cancelled" ? ([["cancelled", trip.waitMin + 1]] as [string, number][]) : []),
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/trips", label: c("backToTrips") }}
        eyebrow={`${e(`tripType.${trip.type}`)} · ${tier?.name} · ${cityName(trip.cityId)}`}
        title={<>{t("title", { ref: trip.ref })} <Chip tone={tripStatusTone[trip.status]}>{e(`tripStatus.${trip.status}`)}</Chip></>}
        sub={<CopyId id={trip.id} />}
        actions={
          live ? (
            <>
              <ActionButton>{t("reassign")}</ActionButton>
              <ActionButton variant="danger" confirm={t("cancelConfirm")}>{t("cancel")}</ActionButton>
            </>
          ) : trip.status === "completed" ? (
            <ActionButton>{t("refund")}</ActionButton>
          ) : null
        }
      />
      {trip.status === "searching" && (
        <Section>
          <Notice tone="warn" label={t("waitingLabel")}>{t("waitingBody")}</Notice>
        </Section>
      )}
      <Blocks>
        <div className="min-w-0">
          <Section>
            <Card>
              <CardHead title={t("route")} />
              <div style={{ padding: "var(--band-pad)" }}>
                <div className="flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span style={{ width: 9, height: 9, borderRadius: 99, background: "var(--green)" }} />
                    <span style={{ width: 1, flex: 1, background: "var(--hairline)", margin: "3px 0" }} />
                    <span style={{ width: 9, height: 9, background: "var(--navy)" }} />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div><p style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)" }}>{t("pickup")}</p><p>{trip.pickup}</p></div>
                    <div><p style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)" }}>{t("dropoff")}</p><p>{trip.dropoff}</p></div>
                  </div>
                  <div className="text-right" style={{ fontSize: "var(--fs-cell)" }}>
                    <p>{num(trip.distanceKm, locale, 1)} km</p>
                    <p style={{ color: "var(--muted2)" }}>{t("minutes", { n: trip.durationMin })}</p>
                  </div>
                </div>
              </div>
            </Card>
          </Section>
          <Section>
            <Card>
              <CardHead title={t("timeline")} />
              <ol style={{ padding: "var(--band-pad)" }} className="space-y-2">
                {steps.filter(([, m]) => start + m * 60000 <= Date.now()).map(([k, m]) => (
                  <li key={k} className="flex justify-between" style={{ fontSize: "var(--fs-cell)" }}>
                    <span>{t(`steps.${k}`)}</span>
                    <span className="font-mono" style={{ fontSize: "var(--fs-mono)", color: "var(--muted2)" }}>{time(new Date(start + m * 60000).toISOString(), locale)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </Section>
          <Section>
            <Card>
              <CardHead title={t("fare")} />
              <KeyValues
                rows={[
                  [t("base"), money(tier?.baseFare ?? 0, locale)],
                  [t("distance", { km: num(trip.distanceKm, locale, 1) }), money(Math.round(trip.distanceKm * (tier?.perKm ?? 0)), locale)],
                  [t("time", { n: trip.durationMin }), money(trip.durationMin * (tier?.perMinute ?? 0), locale)],
                  [t("quoted"), money(trip.fare, locale)],
                  [<strong key="c">{t("charged")}</strong>, <strong key="v">{trip.charged ? money(trip.charged, locale) : "—"}</strong>],
                  [t("payment"), <span key="p" className="inline-flex items-center gap-2">{e(`payment.${trip.payment}`)} <Chip tone={paymentStateTone[trip.paymentState]}>{e(`paymentState.${trip.paymentState}`)}</Chip></span>],
                  ...(trip.cancelReason ? ([[t("cancelReason"), e(`cancelReason.${trip.cancelReason}`)]] as [string, string][]) : []),
                ]}
              />
            </Card>
          </Section>
        </div>
        <div className="min-w-0 space-y-[var(--card-gap)]">
          <Card>
            <CardHead title={t("rider")} />
            {rider && (
              <KeyValues
                rows={[
                  [t("name"), <Link key="r" href={`/dashboard/riders/${rider.id}`} className="hover:underline" style={{ color: "var(--green)" }}>{riderName(rider)}</Link>],
                  [t("phone"), rider.phone],
                  ...(company ? ([[t("company"), <Link key="c" href={`/dashboard/companies/${company.id}`} className="hover:underline" style={{ color: "var(--green)" }}>{company.name}</Link>]] as [string, React.ReactNode][]) : []),
                  [t("rating"), trip.rating ? `${trip.rating} / 5` : "—"],
                ]}
              />
            )}
          </Card>
          <Card>
            <CardHead title={t("ally")} />
            {ally ? (
              <KeyValues
                rows={[
                  [t("name"), <Link key="a" href={`/dashboard/allies/${ally.id}`} className="hover:underline" style={{ color: "var(--green)" }}>{allyName(ally)}</Link>],
                  [t("badge"), <span key="b" className="font-mono">{ally.badge}</span>],
                  [t("phone"), ally.phone],
                  [t("vehicle"), vehicle ? <Link key="v" href={`/dashboard/vehicles/${vehicle.id}`} className="hover:underline" style={{ color: "var(--green)" }}>{vehicle.plate} · {vehicle.make} {vehicle.model}</Link> : "—"],
                ]}
              />
            ) : (
              <p style={{ padding: "var(--band-pad)", color: "var(--muted2)" }}>{t("noAlly")}</p>
            )}
          </Card>
          <Card>
            <CardHead title={t("meta")} />
            <KeyValues rows={[[t("requestedAt"), dateTime(trip.requestedAt, locale)], [t("wait"), t("minutes", { n: trip.waitMin })]]} />
          </Card>
        </div>
      </Blocks>
    </>
  );
}
