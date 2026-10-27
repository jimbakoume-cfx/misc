import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardHead, Eyebrow } from "@/components/ui/card";
import { Chip, Dot } from "@/components/ui/chip";
import { Bars, Counter, Hero, ListRow, Tile, Tiles } from "@/components/ui/figures";
import { Blocks, PageHeader, Section } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { allyName, getOverview, lookupAlly, lookupRider, riderName } from "@/lib/data";
import { money, num, relative, time } from "@/lib/format";
import { severityTone, tripStatusTone } from "@/lib/tones";

export default async function OverviewPage() {
  const t = await getTranslations("console.overview");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const o = await getOverview();
  const hourLabels = o.hourly.map((_, h) => (h % 3 === 0 ? String(h) : ""));
  const nowHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Douala", hour: "2-digit", hour12: false }).format(new Date()));

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub", { time: time(new Date().toISOString(), locale) })} />

      <Card style={{ marginBottom: "var(--section-gap)", padding: "var(--band-pad)" }}>
        <div className="console-overview-columns">
          <Hero label={t("tripsToday")} figure={num(o.tripsToday, locale)} sub={t("tripsTodaySub", { done: o.completedToday, cancelled: o.cancelledToday })} />
          <Hero label={t("revenueToday")} figure={money(o.revenueToday, locale)} sub={t("revenueTodaySub")} />
          <Hero label={t("averageWait")} figure={t("minutes", { n: num(o.averageWaitMin, locale, 1) })} sub={t("averageWaitSub")} />
        </div>
      </Card>

      <Tiles>
        <Tile label={t("tiles.onTrip")} figure={o.alliesOnTrip} sub={t("tiles.allies")} tone="good" href="/dashboard/allies?activity=on_trip" />
        <Tile label={t("tiles.available")} figure={o.alliesAvailable} sub={t("tiles.allies")} href="/dashboard/allies?activity=available" />
        <Tile label={t("tiles.onBreak")} figure={o.alliesOnBreak} sub={t("tiles.allies")} tone="warn" href="/dashboard/allies?activity=on_break" />
        <Tile label={t("tiles.live")} figure={o.live.length} sub={t("tiles.liveSub", { n: o.waiting.length })} href="/dashboard/trips?status=live" />
        <Tile label={t("tiles.offRoad")} figure={o.vehiclesOffRoad} sub={t("tiles.vehicles")} tone={o.vehiclesOffRoad ? "warn" : undefined} href="/dashboard/vehicles?road=off_road" />
      </Tiles>

      <Blocks cols="minmax(0,1fr) var(--queue-w)">
        <div className="min-w-0">
          <Section>
            <Card>
              <CardHead eyebrow={t("hourlyEyebrow")} title={t("hourlyTitle")} />
              <Bars values={o.hourly} labels={hourLabels} highlight={nowHour} />
            </Card>
          </Section>
          <Section>
            <div className="grid gap-[var(--card-gap)]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <Card>
                <CardHead eyebrow={t("attentionEyebrow")} title={t("attentionTitle")} />
                <ListRow label={t("attention.alerts")} count={o.openAlerts.length} tone={o.openAlerts.length ? "danger" : undefined} href="/dashboard/alerts" />
                <ListRow label={t("attention.support")} count={o.waitingConversations} tone={o.waitingConversations ? "warn" : undefined} href="/dashboard/support" />
                <ListRow label={t("attention.disputes")} count={o.activeDisputes} href="/dashboard/disputes" />
                <ListRow label={t("attention.documents")} count={o.documentsDue} tone={o.documentsDue ? "warn" : undefined} href="/dashboard/documents" />
                <ListRow label={t("attention.unfiled")} count={o.unfiled} href="/dashboard/rota?tab=unfiled" />
                <ListRow label={t("attention.approvals")} count={o.ordersToApprove} href="/dashboard/finance" />
                <ListRow label={t("attention.refunds")} count={o.refundsRequested} href="/dashboard/finance?tab=refunds" />
              </Card>
              <Card>
                <CardHead eyebrow={t("citiesEyebrow")} title={t("citiesTitle")} />
                {o.byCity.map((c) => (
                  <div key={c.city.id} className="flex items-center justify-between" style={{ padding: "var(--list-row-pad)", borderBottom: "1px solid var(--hairline)" }}>
                    <span style={{ fontSize: "var(--fs-list-label)" }}>{c.city.name}</span>
                    <span className="flex gap-4" style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)" }}>
                      <span>{t("cityLive", { n: c.live })}</span>
                      <span>{t("cityAvailable", { n: c.available })}</span>
                    </span>
                  </div>
                ))}
                <div style={{ padding: "var(--band-pad)" }}>
                  <Eyebrow small>{t("revenue14")}</Eyebrow>
                  <Bars values={o.dailyRevenue} labels={o.dailyRevenue.map(() => "")} highlight={o.dailyRevenue.length - 1} />
                </div>
              </Card>
            </div>
          </Section>
        </div>

        <div className="min-w-0">
          <Card>
            <CardHead eyebrow={t("queueEyebrow")} title={t("queueTitle")} action={<Link href="/dashboard/trips?status=live" style={{ color: "var(--green)", fontSize: "var(--fs-caption)", fontFamily: "var(--font-label)", fontWeight: 500 }}>{t("seeAll")}</Link>} />
            <div className="flex" style={{ borderBottom: "1px solid var(--hairline)" }}>
              <Counter label={e("tripStatus.searching")} figure={o.waiting.length} tone={o.waiting.length ? "warn" : undefined} />
              <Counter label={t("queueMoving")} figure={o.live.length - o.waiting.length} tone="good" />
              <Counter label={t("queueAlerts")} figure={o.openAlerts.filter((a) => a.severity === "high").length} tone="danger" />
            </div>
            {o.live.slice(0, 12).map((trip) => {
              const rider = lookupRider(trip.riderId);
              const ally = lookupAlly(trip.allyId);
              return (
                <Link key={trip.id} href={`/dashboard/trips/${trip.id}`} className="row-link block transition-colors" style={{ padding: "var(--queue-row-pad)", borderBottom: "1px solid var(--hairline)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono" style={{ fontSize: "var(--fs-mono)" }}>{trip.ref}</span>
                    <Chip tone={tripStatusTone[trip.status]}>{e(`tripStatus.${trip.status}`)}</Chip>
                  </div>
                  <p className="truncate" style={{ fontSize: "var(--fs-cell)", marginTop: 3 }}>
                    {trip.pickup} → {trip.dropoff}
                  </p>
                  <p className="truncate" style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)" }}>
                    {rider ? riderName(rider) : "—"} · {ally ? allyName(ally) : t("noAllyYet")} · {relative(trip.requestedAt, locale)}
                  </p>
                </Link>
              );
            })}
          </Card>
          <Card style={{ marginTop: "var(--card-gap)" }}>
            <CardHead eyebrow={t("alertsEyebrow")} title={t("alertsTitle")} />
            {o.openAlerts.map((a) => (
              <Link key={a.id} href="/dashboard/alerts" className="row-link flex items-start gap-3 transition-colors" style={{ padding: "var(--queue-row-pad)", borderBottom: "1px solid var(--hairline)" }}>
                <span style={{ marginTop: 5 }}>
                  <Dot tone={severityTone[a.severity]} pulse={a.kind === "sos"} />
                </span>
                <span className="min-w-0">
                  <span style={{ fontSize: "var(--fs-cell)", fontWeight: 500 }}>{e(`alertKind.${a.kind}`)}</span> <span style={{ fontSize: "var(--fs-cell)" }}>· {a.subject}</span>
                  <span className="block truncate" style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)" }}>{relative(a.openedAt, locale)}</span>
                </span>
              </Link>
            ))}
          </Card>
        </div>
      </Blocks>
    </>
  );
}
