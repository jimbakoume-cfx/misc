import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Chip } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { listBroadcasts, listPromos } from "@/lib/data";
import { date, dateTime, money, num } from "@/lib/format";
import { one, type Search } from "@/lib/tones";

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "promos";
  const t = await getTranslations("console.marketing");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const [promos, broadcasts] = await Promise.all([listPromos(), listBroadcasts()]);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} actions={<ActionButton variant="primary">{tab === "promos" ? t("newPromo") : t("newBroadcast")}</ActionButton>} />
      <Tabs
        active={tab}
        items={[
          { key: "promos", label: t("tabs.promos"), href: "/dashboard/marketing", count: promos.length },
          { key: "broadcasts", label: t("tabs.broadcasts"), href: "/dashboard/marketing?tab=broadcasts", count: broadcasts.length },
        ]}
      />
      {tab === "promos" ? (
        <Table
          columns={[
            { key: "code", label: t("cols.code"), width: "140px" },
            { key: "value", label: t("cols.value"), width: "minmax(160px,1fr)" },
            { key: "uses", label: t("cols.uses"), width: "130px", align: "right" },
            { key: "window", label: t("cols.window"), width: "220px" },
            { key: "state", label: t("cols.state"), width: "100px" },
            { key: "action", label: "", width: "120px", align: "right" },
          ]}
        >
          {promos.map((p) => (
            <Row key={p.id}>
              <Cell><span className="font-mono" style={{ fontWeight: 500 }}>{p.code}</span></Cell>
              <Cell label={t("cols.value")} sub={p.cap ? t("cap", { amount: money(p.cap, locale) }) : undefined}>
                {p.kind === "percent" ? t("percent", { n: p.value }) : p.kind === "fixed" ? t("fixed", { amount: money(p.value, locale) }) : t("freeRide")}
              </Cell>
              <Cell label={t("cols.uses")} align="right">{num(p.uses, locale)}{p.maxUses ? ` / ${num(p.maxUses, locale)}` : ""}</Cell>
              <Cell label={t("cols.window")}>{date(p.startsAt, locale)} → {date(p.endsAt, locale)}</Cell>
              <Cell label={t("cols.state")}><Chip tone={p.active ? "good" : "quiet"}>{p.active ? t("active") : t("ended")}</Chip></Cell>
              <Cell align="right">{p.active && <ActionButton variant="danger">{t("deactivate")}</ActionButton>}</Cell>
            </Row>
          ))}
        </Table>
      ) : (
        <Table
          columns={[
            { key: "title", label: t("cols.title"), width: "minmax(200px,1fr)" },
            { key: "audience", label: t("cols.audience"), width: "120px" },
            { key: "channel", label: t("cols.channel"), width: "100px" },
            { key: "when", label: t("cols.when"), width: "140px" },
            { key: "reach", label: t("cols.reach"), width: "100px", align: "right" },
            { key: "state", label: t("cols.state"), width: "110px" },
          ]}
        >
          {broadcasts.map((b) => (
            <Row key={b.id}>
              <Cell>{b.title}</Cell>
              <Cell label={t("cols.audience")}>{e(`audience.${b.audience}`)}</Cell>
              <Cell label={t("cols.channel")}>{e(`channel.${b.channel}`)}</Cell>
              <Cell label={t("cols.when")}>{dateTime(b.at, locale)}</Cell>
              <Cell label={t("cols.reach")} align="right">{b.reach ? num(b.reach, locale) : "—"}</Cell>
              <Cell label={t("cols.state")}><Chip tone={b.status === "sent" ? "good" : b.status === "scheduled" ? "warn" : "quiet"}>{e(`broadcastStatus.${b.status}`)}</Chip></Cell>
            </Row>
          ))}
        </Table>
      )}
    </>
  );
}
