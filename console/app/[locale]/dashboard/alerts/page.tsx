import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Card } from "@/components/ui/card";
import { Chip, Dot } from "@/components/ui/chip";
import { Tabs } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { listAlerts } from "@/lib/data";
import { dateTime, relative } from "@/lib/format";
import { one, severityTone, type Search } from "@/lib/tones";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = one(sp.status);
  const t = await getTranslations("console.alerts");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const all = await listAlerts("all");
  const rows = await listAlerts(status);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} actions={<ActionButton>{t("emailSettings")}</ActionButton>} />
      <Tabs
        active={status ?? "active"}
        items={[
          { key: "active", label: t("tabs.active"), href: "/dashboard/alerts", count: all.filter((a) => a.status !== "closed").length },
          { key: "closed", label: t("tabs.closed"), href: "/dashboard/alerts?status=closed", count: all.filter((a) => a.status === "closed").length },
          { key: "all", label: t("tabs.all"), href: "/dashboard/alerts?status=all", count: all.length },
        ]}
      />
      <div className="space-y-[var(--card-gap)]">
        {rows.length === 0 && <Card style={{ padding: 28, textAlign: "center", color: "var(--muted2)" }}>{t("empty")}</Card>}
        {rows.map((a) => (
          <Card key={a.id} tone={a.severity === "high" && a.status === "open" ? "danger" : "neutral"} style={{ padding: "var(--band-pad)" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span style={{ marginTop: 6 }}><Dot tone={severityTone[a.severity]} pulse={a.kind === "sos" && a.status === "open"} /></span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span style={{ fontWeight: 500 }}>{e(`alertKind.${a.kind}`)}</span>
                    <Chip tone={severityTone[a.severity]}>{e(`severity.${a.severity}`)}</Chip>
                    {a.status !== "open" && <Chip tone="quiet">{e(`alertStatus.${a.status}`)}</Chip>}
                  </p>
                  <p style={{ marginTop: 2 }}>
                    {a.subjectHref ? <Link href={a.subjectHref} className="hover:underline" style={{ color: "var(--green)" }}>{a.subject}</Link> : a.subject} — {a.detail}
                  </p>
                  <p style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)", marginTop: 2 }} title={dateTime(a.openedAt, locale)}>{relative(a.openedAt, locale)}</p>
                </div>
              </div>
              {a.status !== "closed" && (
                <div className="flex gap-2">
                  {a.status === "open" && <ActionButton>{t("acknowledge")}</ActionButton>}
                  <ActionButton variant="primary">{t("close")}</ActionButton>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
