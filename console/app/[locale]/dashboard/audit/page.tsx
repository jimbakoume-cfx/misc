import { getLocale, getTranslations } from "next-intl/server";
import { FilterBar } from "@/components/ui/filters";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { listAudit } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { one, type Search } from "@/lib/tones";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations("console.audit");
  const locale = await getLocale();
  const rows = await listAudit(one(sp.q));
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />
      <FilterBar fields={[{ kind: "search", name: "q", width: "var(--tf-search)", placeholder: t("search") }]} />
      <Table
        columns={[
          { key: "at", label: t("cols.at"), width: "140px" },
          { key: "actor", label: t("cols.actor"), width: "160px" },
          { key: "action", label: t("cols.action"), width: "200px" },
          { key: "target", label: t("cols.target"), width: "200px" },
          { key: "detail", label: t("cols.detail"), width: "minmax(160px,1fr)" },
        ]}
        empty={t("empty")}
      >
        {rows.map((ev) => (
          <Row key={ev.id}>
            <Cell>{dateTime(ev.at, locale)}</Cell>
            <Cell label={t("cols.actor")}>{ev.actor}</Cell>
            <Cell label={t("cols.action")} mono>{ev.action}</Cell>
            <Cell label={t("cols.target")}><span className="block truncate">{ev.target}</span></Cell>
            <Cell label={t("cols.detail")}>{ev.detail}</Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
