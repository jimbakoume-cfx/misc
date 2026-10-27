import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Notice } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PageHeader, Section } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { getTiers } from "@/lib/data";
import { money } from "@/lib/format";

export default async function TiersPage() {
  const t = await getTranslations("console.tiers");
  const locale = await getLocale();
  const tiers = await getTiers();
  const sw = ["rides", "rentals", "airport", "companies"] as const;

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} actions={<ActionButton variant="primary">{t("add")}</ActionButton>} />
      <Section><Notice tone="neutral">{t("rule")}</Notice></Section>
      <Table
        columns={[
          { key: "order", label: t("cols.order"), width: "var(--tier-order)" },
          { key: "picture", label: "", width: "var(--tier-picture)" },
          { key: "code", label: t("cols.code"), width: "var(--tier-code)" },
          { key: "prices", label: t("cols.prices"), width: "minmax(200px,1fr)" },
          { key: "fleet", label: t("cols.fleet"), width: "var(--tier-fleet)", align: "right" },
          { key: "switches", label: t("cols.switches"), width: "var(--tier-switches)" },
          { key: "action", label: "", width: "var(--tier-action)", align: "right" },
        ]}
      >
        {tiers.map((x) => (
          <Row key={x.id}>
            <Cell><span className="font-display" style={{ fontSize: "var(--fs-figure-cell)" }}>{x.order}</span></Cell>
            <Cell>
              <span className="inline-flex items-center justify-center" style={{ width: 48, height: 32, borderRadius: 6, background: "var(--tint)", border: "1px solid var(--hairline)", fontSize: 18 }} aria-hidden>🚘</span>
            </Cell>
            <Cell sub={t("seats", { n: x.seats })}><span style={{ fontWeight: 500 }}>{x.name}</span> <span className="font-mono" style={{ fontSize: "var(--fs-mono)", color: "var(--muted2)" }}>{x.code}</span></Cell>
            <Cell label={t("cols.prices")} sub={t("minimum", { amount: money(x.minimumFare, locale) })}>
              {t("priceLine", { base: money(x.baseFare, locale), km: money(x.perKm, locale), min: money(x.perMinute, locale) })}
            </Cell>
            <Cell label={t("cols.fleet")} align="right">{x.fleet}</Cell>
            <Cell label={t("cols.switches")}>
              <span className="inline-flex flex-wrap gap-1">
                {sw.map((s) => (
                  <Chip key={s} tone={x.switches[s] ? "good" : "quiet"}>{t(`switch.${s}`)}</Chip>
                ))}
              </span>
            </Cell>
            <Cell align="right"><ActionButton>{t("edit")}</ActionButton></Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
