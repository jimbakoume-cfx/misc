import { getLocale, getTranslations } from "next-intl/server";
import { Chip } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { listDisputes, lookupRider, lookupTrip, riderName } from "@/lib/data";
import { money, relative } from "@/lib/format";
import { disputeTone, one, type Search } from "@/lib/tones";

export default async function DisputesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const stage = one(sp.stage) ?? "active";
  const t = await getTranslations("console.disputes");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const all = await listDisputes();
  const rows = await listDisputes(stage === "all" ? undefined : stage);
  const n = (s: string) => all.filter((d) => d.stage === s).length;

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />
      <Tabs
        active={stage}
        items={[
          { key: "active", label: t("tabs.active"), href: "/dashboard/disputes", count: all.length - n("resolved") - n("refunded") },
          { key: "open", label: e("disputeStage.open"), href: "/dashboard/disputes?stage=open", count: n("open") },
          { key: "investigating", label: e("disputeStage.investigating"), href: "/dashboard/disputes?stage=investigating", count: n("investigating") },
          { key: "resolved", label: e("disputeStage.resolved"), href: "/dashboard/disputes?stage=resolved", count: n("resolved") },
          { key: "all", label: t("tabs.all"), href: "/dashboard/disputes?stage=all", count: all.length },
        ]}
      />
      <Table
        columns={[
          { key: "ref", label: t("cols.ref"), width: "90px" },
          { key: "opened", label: t("cols.opened"), width: "120px" },
          { key: "rider", label: t("cols.rider"), width: "minmax(150px,1fr)" },
          { key: "trip", label: t("cols.trip"), width: "100px" },
          { key: "reason", label: t("cols.reason"), width: "150px" },
          { key: "amount", label: t("cols.amount"), width: "120px", align: "right" },
          { key: "assignee", label: t("cols.assignee"), width: "120px" },
          { key: "stage", label: t("cols.stage"), width: "130px" },
        ]}
        empty={t("empty")}
      >
        {rows.map((d) => {
          const r = lookupRider(d.riderId);
          return (
            <Row key={d.id} href={`/dashboard/disputes/${d.id}`}>
              <Cell mono>{d.ref}</Cell>
              <Cell label={t("cols.opened")}>{relative(d.openedAt, locale)}</Cell>
              <Cell label={t("cols.rider")}>{r ? riderName(r) : "—"}</Cell>
              <Cell label={t("cols.trip")} mono>{lookupTrip(d.tripId)?.ref}</Cell>
              <Cell label={t("cols.reason")}>{e(`disputeReason.${d.reason}`)}</Cell>
              <Cell label={t("cols.amount")} align="right">{d.amount ? money(d.amount, locale) : "—"}</Cell>
              <Cell label={t("cols.assignee")}>{d.assignee ?? <span style={{ color: "var(--warn)" }}>{t("nobody")}</span>}</Cell>
              <Cell label={t("cols.stage")}><Chip tone={disputeTone[d.stage]}>{e(`disputeStage.${d.stage}`)}</Chip></Cell>
            </Row>
          );
        })}
      </Table>
    </>
  );
}
