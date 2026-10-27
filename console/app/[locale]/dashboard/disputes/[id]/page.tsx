import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Card, CardHead } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { KeyValues } from "@/components/ui/controls";
import { Blocks, PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { allyName, getDispute, lookupAlly, lookupRider, lookupTrip, riderName } from "@/lib/data";
import { dateTime, money } from "@/lib/format";
import { disputeTone } from "@/lib/tones";

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDispute(id);
  if (!d) notFound();
  const t = await getTranslations("console.dispute");
  const e = await getTranslations("console.enums");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const trip = lookupTrip(d.tripId);
  const rider = lookupRider(d.riderId);
  const ally = lookupAlly(d.allyId);
  const closed = d.stage === "resolved" || d.stage === "refunded";
  const link = { color: "var(--green)" } as const;

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/disputes", label: c("backToDisputes") }}
        eyebrow={e(`disputeReason.${d.reason}`)}
        title={<>{t("title", { ref: d.ref })} <Chip tone={disputeTone[d.stage]}>{e(`disputeStage.${d.stage}`)}</Chip></>}
        actions={
          closed ? null : (
            <>
              {!d.assignee && <ActionButton>{t("take")}</ActionButton>}
              <ActionButton>{t("escalate")}</ActionButton>
              <ActionButton variant="good">{t("refund")}</ActionButton>
              <ActionButton variant="primary">{t("resolve")}</ActionButton>
            </>
          )
        }
      />
      <Blocks>
        <Card>
          <CardHead title={t("case")} />
          <KeyValues
            rows={[
              [t("opened"), dateTime(d.openedAt, locale)],
              [t("assignee"), d.assignee ?? "—"],
              [t("claimed"), d.amount ? money(d.amount, locale) : "—"],
              [t("trip"), trip ? <Link key="t" href={`/dashboard/trips/${trip.id}`} className="font-mono hover:underline" style={link}>{trip.ref}</Link> : "—"],
              [t("route"), trip ? `${trip.pickup} → ${trip.dropoff}` : "—"],
              [t("charged"), trip ? money(trip.charged, locale) : "—"],
            ]}
          />
        </Card>
        <Card>
          <CardHead title={t("people")} />
          <KeyValues
            rows={[
              [t("rider"), rider ? <Link key="r" href={`/dashboard/riders/${rider.id}`} className="hover:underline" style={link}>{riderName(rider)}</Link> : "—"],
              [t("ally"), ally ? <Link key="a" href={`/dashboard/allies/${ally.id}`} className="hover:underline" style={link}>{allyName(ally)}</Link> : "—"],
            ]}
          />
        </Card>
      </Blocks>
    </>
  );
}
