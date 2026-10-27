import { getLocale, getTranslations } from "next-intl/server";
import { Chip } from "@/components/ui/chip";
import { FilterBar } from "@/components/ui/filters";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { cityName, listCompanies } from "@/lib/data";
import { money } from "@/lib/format";
import { companyTone, one, type Search } from "@/lib/tones";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const t = await getTranslations("console.companies");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const rows = await listCompanies(one(sp.q));
  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("count", { n: rows.length })} />
      <FilterBar fields={[{ kind: "search", name: "q", width: "var(--af-search)", placeholder: t("search") }]} />
      <Table
        columns={[
          { key: "name", label: t("cols.name"), width: "minmax(180px,1fr)" },
          { key: "account", label: t("cols.account"), width: "110px" },
          { key: "city", label: t("cols.city"), width: "100px" },
          { key: "billing", label: t("cols.billing"), width: "110px" },
          { key: "position", label: t("cols.position"), width: "160px", align: "right" },
          { key: "riders", label: t("cols.riders"), width: "80px", align: "right" },
          { key: "spend", label: t("cols.spend"), width: "140px", align: "right" },
          { key: "status", label: t("cols.status"), width: "100px" },
        ]}
        empty={t("empty")}
      >
        {rows.map((c) => (
          <Row key={c.id} href={`/dashboard/companies/${c.id}`}>
            <Cell sub={c.billingEmail}><span style={{ fontWeight: 500 }}>{c.name}</span></Cell>
            <Cell label={t("cols.account")} mono>{c.accountId}</Cell>
            <Cell label={t("cols.city")}>{cityName(c.cityId)}</Cell>
            <Cell label={t("cols.billing")}>{e(`billing.${c.billingMode}`)}</Cell>
            <Cell label={t("cols.position")} align="right" sub={c.billingMode === "credit" ? t("ofLimit", { limit: money(c.creditLimit, locale) }) : t("prepaidLeft")}>
              <span style={{ color: c.billingMode === "credit" && c.owed > c.creditLimit * 0.8 ? "var(--warn)" : undefined }}>{money(c.billingMode === "credit" ? c.owed : c.prepaidBalance, locale)}</span>
            </Cell>
            <Cell label={t("cols.riders")} align="right">{c.riders}</Cell>
            <Cell label={t("cols.spend")} align="right" sub={t("tripsN", { n: c.tripsThisMonth })}>{money(c.spendThisMonth, locale)}</Cell>
            <Cell label={t("cols.status")}><Chip tone={companyTone[c.status]}>{e(`companyStatus.${c.status}`)}</Chip></Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
