import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Card, CardHead } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { CopyId } from "@/components/ui/copy-id";
import { KeyValues } from "@/components/ui/controls";
import { Tile, Tiles } from "@/components/ui/figures";
import { Blocks, PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { cityName, getCompany, listInvoices } from "@/lib/data";
import { date, money } from "@/lib/format";
import { companyTone, invoiceTone } from "@/lib/tones";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const co = await getCompany(id);
  if (!co) notFound();
  const t = await getTranslations("console.company");
  const e = await getTranslations("console.enums");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const invoices = await listInvoices(co.id);
  const used = co.creditLimit ? co.owed / co.creditLimit : 0;

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/companies", label: c("backToCompanies") }}
        eyebrow={`${co.accountId} · ${cityName(co.cityId)}`}
        title={<>{co.name} <Chip tone={companyTone[co.status]}>{e(`companyStatus.${co.status}`)}</Chip></>}
        sub={<CopyId id={co.id} />}
        actions={
          <>
            {co.billingMode === "prepaid" ? <ActionButton variant="primary">{t("topUp")}</ActionButton> : <ActionButton>{t("changeLimit")}</ActionButton>}
            {co.status === "active" ? <ActionButton variant="danger" confirm={t("suspendConfirm")}>{t("suspend")}</ActionButton> : <ActionButton variant="good">{t("reinstate")}</ActionButton>}
          </>
        }
      />
      <Tiles>
        {co.billingMode === "credit" ? (
          <Tile label={t("owed")} figure={money(co.owed, locale)} sub={t("usedOfLimit", { pct: Math.round(used * 100), limit: money(co.creditLimit, locale) })} tone={used > 0.8 ? "warn" : undefined} />
        ) : (
          <Tile label={t("prepaid")} figure={money(co.prepaidBalance, locale)} tone={co.prepaidBalance < 100000 ? "warn" : undefined} />
        )}
        <Tile label={t("spend")} figure={money(co.spendThisMonth, locale)} sub={t("tripsN", { n: co.tripsThisMonth })} />
        <Tile label={t("riders")} figure={co.riders} />
      </Tiles>
      <Blocks>
        <Table
          columns={[
            { key: "number", label: t("cols.number"), width: "170px" },
            { key: "period", label: t("cols.period"), width: "110px" },
            { key: "issued", label: t("cols.issued"), width: "130px" },
            { key: "amount", label: t("cols.amount"), width: "minmax(120px,1fr)", align: "right" },
            { key: "status", label: t("cols.status"), width: "110px" },
          ]}
          empty={t("noInvoices")}
        >
          {invoices.map((i) => (
            <Row key={i.id}>
              <Cell mono>{i.number}</Cell>
              <Cell label={t("cols.period")}>{i.period}</Cell>
              <Cell label={t("cols.issued")}>{date(i.issuedAt, locale)}</Cell>
              <Cell label={t("cols.amount")} align="right">{money(i.amount, locale)}</Cell>
              <Cell label={t("cols.status")}><Chip tone={invoiceTone[i.status]}>{e(`invoiceStatus.${i.status}`)}</Chip></Cell>
            </Row>
          ))}
        </Table>
        <Card>
          <CardHead title={t("account")} />
          <KeyValues
            rows={[
              [t("billing"), e(`billing.${co.billingMode}`)],
              [t("billingEmail"), co.billingEmail],
              [t("since"), date(co.since, locale)],
            ]}
          />
        </Card>
      </Blocks>
    </>
  );
}
