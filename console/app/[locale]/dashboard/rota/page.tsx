import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Notice } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/controls";
import { PageHeader, Section } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { allyName, getRota, lookupAlly, lookupVehicle } from "@/lib/data";
import { dateTime, money, num } from "@/lib/format";
import { one, roadTone, type Search } from "@/lib/tones";

export default async function RotaPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "pairs";
  const t = await getTranslations("console.rota");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const rota = await getRota();
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />
      <Tabs
        active={tab}
        items={[
          { key: "pairs", label: t("tabs.pairs"), href: "/dashboard/rota", count: rota.pairs.length },
          { key: "eos", label: t("tabs.eos"), href: "/dashboard/rota?tab=eos", count: rota.endOfShift.length },
          { key: "unfiled", label: t("tabs.unfiled"), href: "/dashboard/rota?tab=unfiled", count: rota.unfiled.length },
        ]}
      />
      {tab === "pairs" && (
        <Table
          columns={[
            { key: "plate", label: t("cols.plate"), width: "var(--pair-plate)" },
            { key: "crew", label: t("cols.crew"), width: "minmax(200px,1fr)" },
            { key: "rest", label: t("cols.rest"), width: "var(--pair-rest)" },
            { key: "state", label: t("cols.state"), width: "var(--pair-state)" },
            { key: "action", label: "", width: "var(--pair-action)", align: "right" },
          ]}
        >
          {rota.pairs.map((v) => {
            const crew = v.allyIds.map(lookupAlly).filter((a) => a !== null);
            return (
              <Row key={v.id}>
                <Cell><Link href={`/dashboard/vehicles/${v.id}`} className="font-mono hover:underline" style={{ fontSize: "var(--fs-plate)", fontWeight: 500 }}>{v.plate}</Link></Cell>
                <Cell label={t("cols.crew")}>
                  {crew.length ? (
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {crew.map((a) => (
                        <Link key={a.id} href={`/dashboard/allies/${a.id}`} className="hover:underline">
                          {allyName(a)} <span style={{ color: "var(--muted2)", fontSize: "var(--fs-cell-sub)" }}>{a.role === "titulaire" ? t("titulaire") : t("relief")}</span>
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span style={{ color: "var(--warn)" }}>{t("emptySeat")}</span>
                  )}
                </Cell>
                <Cell label={t("cols.rest")}>{v.restDays.map((d) => e(`weekday.${days[d]}`)).join(", ")}</Cell>
                <Cell label={t("cols.state")}><Chip tone={roadTone[v.road]}>{e(`road.${v.road}`)}</Chip></Cell>
                <Cell align="right"><ActionButton>{t("replace")}</ActionButton></Cell>
              </Row>
            );
          })}
        </Table>
      )}
      {tab === "eos" && (
        <>
          <Section><Notice tone="neutral">{t("eosHelp")}</Notice></Section>
          <Table
            columns={[
              { key: "waiting", label: t("cols.waiting"), width: "var(--eos-waiting)" },
              { key: "ally", label: t("cols.ally"), width: "minmax(160px,1fr)" },
              { key: "car", label: t("cols.car"), width: "var(--eos-car)" },
              { key: "odo", label: t("cols.odometer"), width: "120px", align: "right" },
              { key: "action", label: "", width: "var(--eos-action)", align: "right" },
            ]}
          >
            {rota.endOfShift.map((x) => {
              const a = lookupAlly(x.allyId)!;
              return (
                <Row key={x.id} style={{ minHeight: "var(--eos-row-h)", padding: "var(--eos-row-pad)" }} highlight={x.waitingMin > 30}>
                  <Cell><span className="font-display" style={{ fontSize: "var(--fs-figure-cell)", color: x.waitingMin > 30 ? "var(--danger)" : undefined }}>{x.waitingMin}′</span></Cell>
                  <Cell sub={a.badge}>{allyName(a)}</Cell>
                  <Cell label={t("cols.car")} mono>{lookupVehicle(x.vehicleId)?.plate}</Cell>
                  <Cell label={t("cols.odometer")} align="right">{num(x.odometer, locale)} km</Cell>
                  <Cell align="right"><ActionButton variant="primary">{t("close")}</ActionButton></Cell>
                </Row>
              );
            })}
          </Table>
        </>
      )}
      {tab === "unfiled" && (
        <Table
          columns={[
            { key: "ally", label: t("cols.ally"), width: "minmax(160px,1fr)" },
            { key: "car", label: t("cols.car"), width: "var(--eos-car)" },
            { key: "owed", label: t("cols.owed"), width: "var(--unfiled-owed)", align: "right" },
            { key: "ended", label: t("cols.ended"), width: "var(--unfiled-ended)" },
            { key: "canWork", label: t("cols.canWork"), width: "var(--unfiled-can-work)" },
            { key: "action", label: "", width: "var(--unfiled-action)", align: "right" },
          ]}
        >
          {rota.unfiled.map((x) => {
            const a = lookupAlly(x.allyId)!;
            return (
              <Row key={x.id}>
                <Cell sub={a.badge}>{allyName(a)}</Cell>
                <Cell label={t("cols.car")} mono>{lookupVehicle(x.vehicleId)?.plate}</Cell>
                <Cell label={t("cols.owed")} align="right">{money(x.owed, locale)}</Cell>
                <Cell label={t("cols.ended")}>{dateTime(x.endedAt, locale)}</Cell>
                <Cell label={t("cols.canWork")}><Chip tone={x.canWork ? "good" : "danger"}>{x.canWork ? t("yes") : t("no")}</Chip></Cell>
                <Cell align="right"><ActionButton>{t("file")}</ActionButton></Cell>
              </Row>
            );
          })}
        </Table>
      )}
    </>
  );
}
