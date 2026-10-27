import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Card, CardHead } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CopyId } from "@/components/ui/copy-id";
import { KeyValues } from "@/components/ui/controls";
import { Tile, Tiles } from "@/components/ui/figures";
import { Blocks, PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { allyName, cityName, getTiers, getVehicle, lookupAlly } from "@/lib/data";
import { date, daysFromNow, num, relative } from "@/lib/format";
import { allyStateTone, roadTone } from "@/lib/tones";

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getVehicle(id);
  if (!v) notFound();
  const t = await getTranslations("console.vehicle");
  const e = await getTranslations("console.enums");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const tier = (await getTiers()).find((x) => x.code === v.tier);
  const crew = v.allyIds.map(lookupAlly).filter((a) => a !== null);
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/vehicles", label: c("backToVehicles") }}
        eyebrow={`${v.make} ${v.model} · ${tier?.name} · ${cityName(v.cityId)}`}
        title={<><span className="font-mono">{v.plate}</span> <Chip tone={roadTone[v.road]} dot>{e(`road.${v.road}`)}</Chip></>}
        sub={<CopyId id={v.id} />}
        actions={
          v.road === "on_road" ? (
            <ActionButton variant="danger" confirm={t("offRoadConfirm")}>{t("offRoad")}</ActionButton>
          ) : v.road === "left_fleet" ? null : (
            <ActionButton variant="good">{t("onRoad")}</ActionButton>
          )
        }
      />
      <Tiles>
        <Tile label={t("odometer")} figure={`${num(v.odometer, locale)} km`} />
        <Tile label={t("lastService")} figure={relative(v.lastServiceAt, locale)} sub={date(v.lastServiceAt, locale)} />
        <Tile label={t("crew")} figure={crew.length} sub={t("crewSub")} />
      </Tiles>
      <Blocks>
        <div className="min-w-0 space-y-[var(--section-gap)]">
          <Card>
            <CardHead title={t("papers")} />
            {v.papers.map((p) => {
              const d = daysFromNow(p.expiresAt);
              return (
                <div key={p.kind} className="flex items-center justify-between gap-3" style={{ padding: "var(--list-row-pad)", borderBottom: "1px solid var(--hairline)" }}>
                  <span>
                    {e(`docKind.${p.kind}`)} <span className="font-mono" style={{ fontSize: "var(--fs-mono)", color: "var(--muted2)" }}>{p.number}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)" }}>{date(p.expiresAt, locale)}</span>
                    <Chip tone={d < 0 ? "danger" : d < 30 ? "warn" : "good"}>{d < 0 ? t("expired") : t("inDays", { n: d })}</Chip>
                  </span>
                </div>
              );
            })}
          </Card>
          <Card>
            <CardHead title={t("crew")} />
            {crew.map((a) => (
              <Link key={a.id} href={`/dashboard/allies/${a.id}`} className="row-link flex items-center justify-between gap-3 transition-colors" style={{ padding: "var(--list-row-pad)", borderBottom: "1px solid var(--hairline)" }}>
                <span>{allyName(a)} <span className="font-mono" style={{ fontSize: "var(--fs-mono)", color: "var(--muted2)" }}>{a.badge}</span></span>
                <span className="flex items-center gap-2"><span style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)" }}>{e(`allyRole.${a.role}`)}</span><Chip tone={allyStateTone[a.state]}>{e(`allyState.${a.state}`)}</Chip></span>
              </Link>
            ))}
          </Card>
        </div>
        <Card>
          <CardHead title={t("identity")} />
          <KeyValues
            rows={[
              [t("vin"), <span key="vin" className="font-mono">{v.vin}</span>],
              [t("year"), v.year],
              [t("colour"), v.colour],
              [t("class"), tier?.name],
              [t("restDay"), v.restDays.map((d) => e(`weekday.${days[d]}`)).join(", ")],
            ]}
          />
        </Card>
      </Blocks>
    </>
  );
}
