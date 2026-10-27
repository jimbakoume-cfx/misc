import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Chip } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { allyName, listDocuments, lookupAlly, lookupVehicle } from "@/lib/data";
import { date, daysFromNow } from "@/lib/format";
import { docStateTone, one, type Search } from "@/lib/tones";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const state = one(sp.state);
  const t = await getTranslations("console.documents");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const all = await listDocuments("all");
  const rows = await listDocuments(state);
  const count = (s: string) => all.filter((d) => d.state === s).length;

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />
      <Tabs
        active={state ?? "attention"}
        items={[
          { key: "attention", label: t("tabs.attention"), href: "/dashboard/documents", count: all.length - count("valid") },
          { key: "expired", label: e("docState.expired"), href: "/dashboard/documents?state=expired", count: count("expired") },
          { key: "expiring", label: e("docState.expiring"), href: "/dashboard/documents?state=expiring", count: count("expiring") },
          { key: "to_review", label: e("docState.to_review"), href: "/dashboard/documents?state=to_review", count: count("to_review") },
          { key: "all", label: t("tabs.all"), href: "/dashboard/documents?state=all", count: all.length },
        ]}
      />
      <Table
        columns={[
          { key: "whose", label: t("cols.whose"), width: "minmax(var(--doc-whose),1fr)" },
          { key: "which", label: t("cols.which"), width: "var(--doc-which)" },
          { key: "number", label: t("cols.number"), width: "var(--doc-number)" },
          { key: "expires", label: t("cols.expires"), width: "var(--doc-expires)" },
          { key: "state", label: t("cols.state"), width: "110px" },
          { key: "action", label: "", width: "var(--doc-action)", align: "right" },
        ]}
        empty={t("empty")}
      >
        {rows.map((d) => {
          const who = d.whose.kind === "ally" ? lookupAlly(d.whose.id) : null;
          const car = d.whose.kind === "vehicle" ? lookupVehicle(d.whose.id) : null;
          const days = daysFromNow(d.expiresAt);
          return (
            <Row key={d.id}>
              <Cell sub={who ? t("ally") : t("vehicle")}>
                {who ? (
                  <Link href={`/dashboard/allies/${who.id}`} className="hover:underline">{allyName(who)}</Link>
                ) : car ? (
                  <Link href={`/dashboard/vehicles/${car.id}`} className="font-mono hover:underline">{car.plate}</Link>
                ) : null}
              </Cell>
              <Cell label={t("cols.which")}>{e(`docKind.${d.which}`)}</Cell>
              <Cell label={t("cols.number")} mono>{d.number}</Cell>
              <Cell label={t("cols.expires")} sub={days < 0 ? t("daysAgo", { n: -days }) : t("inDays", { n: days })}>{date(d.expiresAt, locale)}</Cell>
              <Cell label={t("cols.state")}><Chip tone={docStateTone[d.state]}>{e(`docState.${d.state}`)}</Chip></Cell>
              <Cell align="right">
                <span className="inline-flex gap-2">
                  {d.state === "to_review" ? <ActionButton variant="good">{t("approve")}</ActionButton> : <ActionButton>{t("remind")}</ActionButton>}
                </span>
              </Cell>
            </Row>
          );
        })}
      </Table>
    </>
  );
}
