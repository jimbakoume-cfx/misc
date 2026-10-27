import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Chip } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/controls";
import { Tile, Tiles } from "@/components/ui/figures";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { listInvoices, listOrders, listRefunds, lookupCompany, lookupRider, lookupTrip, riderName } from "@/lib/data";
import { date, money, relative } from "@/lib/format";
import { invoiceTone, one, orderTone, refundTone, type Search } from "@/lib/tones";

export default async function FinancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "orders";
  const t = await getTranslations("console.finance");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const [orders, invoices, refunds] = await Promise.all([listOrders(), listInvoices(), listRefunds()]);
  const pending = orders.filter((o) => o.status === "pending_approval");
  const unpaid = invoices.filter((i) => i.status === "issued" || i.status === "overdue");

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} actions={<ActionButton variant="primary">{t("newOrder")}</ActionButton>} />
      <Tiles>
        <Tile label={t("toApprove")} figure={pending.length} sub={money(pending.reduce((s, o) => s + o.amount, 0), locale)} tone={pending.length ? "warn" : undefined} href="/dashboard/finance" />
        <Tile label={t("receivable")} figure={money(unpaid.reduce((s, i) => s + i.amount, 0), locale)} sub={t("invoicesN", { n: unpaid.length })} href="/dashboard/finance?tab=invoices" />
        <Tile label={t("overdue")} figure={invoices.filter((i) => i.status === "overdue").length} tone="danger" href="/dashboard/finance?tab=invoices" />
        <Tile label={t("refundsRequested")} figure={refunds.filter((r) => r.status === "requested").length} href="/dashboard/finance?tab=refunds" />
      </Tiles>
      <Tabs
        active={tab}
        items={[
          { key: "orders", label: t("tabs.orders"), href: "/dashboard/finance", count: orders.length },
          { key: "invoices", label: t("tabs.invoices"), href: "/dashboard/finance?tab=invoices", count: invoices.length },
          { key: "refunds", label: t("tabs.refunds"), href: "/dashboard/finance?tab=refunds", count: refunds.length },
        ]}
      />
      {tab === "orders" && (
        <Table
          columns={[
            { key: "ref", label: t("cols.ref"), width: "130px" },
            { key: "beneficiary", label: t("cols.beneficiary"), width: "minmax(160px,1fr)" },
            { key: "category", label: t("cols.category"), width: "120px" },
            { key: "amount", label: t("cols.amount"), width: "140px", align: "right" },
            { key: "by", label: t("cols.createdBy"), width: "140px" },
            { key: "status", label: t("cols.status"), width: "140px" },
            { key: "action", label: "", width: "190px", align: "right" },
          ]}
        >
          {orders.map((o) => (
            <Row key={o.id} highlight={o.status === "pending_approval"}>
              <Cell mono>{o.ref}</Cell>
              <Cell label={t("cols.beneficiary")} sub={relative(o.createdAt, locale)}>{o.beneficiary}</Cell>
              <Cell label={t("cols.category")}>{e(`orderCategory.${o.category}`)}</Cell>
              <Cell label={t("cols.amount")} align="right">{money(o.amount, locale)}</Cell>
              <Cell label={t("cols.createdBy")} sub={o.approver ? t("approvedBy", { name: o.approver }) : undefined}>{o.createdBy}</Cell>
              <Cell label={t("cols.status")}><Chip tone={orderTone[o.status]}>{e(`orderStatus.${o.status}`)}</Chip></Cell>
              <Cell align="right">
                {o.status === "pending_approval" ? (
                  <span className="inline-flex gap-2">
                    <ActionButton variant="danger">{t("reject")}</ActionButton>
                    <ActionButton variant="good">{t("approve")}</ActionButton>
                  </span>
                ) : o.status === "approved" ? (
                  <ActionButton>{t("markPaid")}</ActionButton>
                ) : null}
              </Cell>
            </Row>
          ))}
        </Table>
      )}
      {tab === "invoices" && (
        <Table
          columns={[
            { key: "number", label: t("cols.number"), width: "170px" },
            { key: "company", label: t("cols.company"), width: "minmax(160px,1fr)" },
            { key: "period", label: t("cols.period"), width: "100px" },
            { key: "issued", label: t("cols.issued"), width: "130px" },
            { key: "amount", label: t("cols.amount"), width: "140px", align: "right" },
            { key: "status", label: t("cols.status"), width: "110px" },
          ]}
        >
          {invoices.map((i) => {
            const co = lookupCompany(i.companyId);
            return (
              <Row key={i.id}>
                <Cell mono>{i.number}</Cell>
                <Cell label={t("cols.company")}>{co && <Link href={`/dashboard/companies/${co.id}`} className="hover:underline">{co.name}</Link>}</Cell>
                <Cell label={t("cols.period")}>{i.period}</Cell>
                <Cell label={t("cols.issued")}>{date(i.issuedAt, locale)}</Cell>
                <Cell label={t("cols.amount")} align="right">{money(i.amount, locale)}</Cell>
                <Cell label={t("cols.status")}><Chip tone={invoiceTone[i.status]}>{e(`invoiceStatus.${i.status}`)}</Chip></Cell>
              </Row>
            );
          })}
        </Table>
      )}
      {tab === "refunds" && (
        <Table
          columns={[
            { key: "trip", label: t("cols.trip"), width: "110px" },
            { key: "rider", label: t("cols.rider"), width: "minmax(150px,1fr)" },
            { key: "reason", label: t("cols.reason"), width: "180px" },
            { key: "amount", label: t("cols.amount"), width: "130px", align: "right" },
            { key: "status", label: t("cols.status"), width: "110px" },
            { key: "action", label: "", width: "190px", align: "right" },
          ]}
        >
          {refunds.map((r) => {
            const trip = lookupTrip(r.tripId);
            const rider = lookupRider(r.riderId);
            return (
              <Row key={r.id}>
                <Cell>{trip && <Link href={`/dashboard/trips/${trip.id}`} className="font-mono hover:underline">{trip.ref}</Link>}</Cell>
                <Cell label={t("cols.rider")} sub={relative(r.requestedAt, locale)}>{rider ? riderName(rider) : "—"}</Cell>
                <Cell label={t("cols.reason")}>{r.reason}</Cell>
                <Cell label={t("cols.amount")} align="right">{money(r.amount, locale)}</Cell>
                <Cell label={t("cols.status")}><Chip tone={refundTone[r.status]}>{e(`refundStatus.${r.status}`)}</Chip></Cell>
                <Cell align="right">
                  {r.status === "requested" && (
                    <span className="inline-flex gap-2">
                      <ActionButton variant="danger">{t("refuse")}</ActionButton>
                      <ActionButton variant="good">{t("approve")}</ActionButton>
                    </span>
                  )}
                </Cell>
              </Row>
            );
          })}
        </Table>
      )}
    </>
  );
}
