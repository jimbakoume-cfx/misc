import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Card, CardHead } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Avatar, KeyValues, Tabs } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page";
import { Cell, Row, Table } from "@/components/ui/table";
import { cityName, getCities, getZones, listOperators } from "@/lib/data";
import { IDLE_MINUTES } from "@/lib/auth/config";
import { num, relative } from "@/lib/format";
import { one, operatorTone, type Search } from "@/lib/tones";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = one(sp.tab) ?? "cities";
  const t = await getTranslations("console.settings");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const [cities, zones, operators] = await Promise.all([getCities(), getZones(), listOperators()]);

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs
        active={tab}
        items={[
          { key: "cities", label: t("tabs.cities"), href: "/dashboard/settings" },
          { key: "zones", label: t("tabs.zones"), href: "/dashboard/settings?tab=zones" },
          { key: "operators", label: t("tabs.operators"), href: "/dashboard/settings?tab=operators" },
          { key: "security", label: t("tabs.security"), href: "/dashboard/settings?tab=security" },
        ]}
      />
      {tab === "cities" && (
        <Table
          columns={[
            { key: "name", label: t("cols.city"), width: "minmax(150px,1fr)" },
            { key: "tz", label: t("cols.timezone"), width: "160px" },
            { key: "zones", label: t("cols.zones"), width: "90px", align: "right" },
            { key: "default", label: t("cols.default"), width: "110px" },
            { key: "state", label: t("cols.state"), width: "100px" },
            { key: "action", label: "", width: "120px", align: "right" },
          ]}
        >
          {cities.map((c) => (
            <Row key={c.id}>
              <Cell sub={`${num(c.lat, locale, 4)}, ${num(c.lng, locale, 4)}`}><span style={{ fontWeight: 500 }}>{c.name}</span></Cell>
              <Cell label={t("cols.timezone")} mono>{c.timezone}</Cell>
              <Cell label={t("cols.zones")} align="right">{zones.filter((z) => z.cityId === c.id).length}</Cell>
              <Cell label={t("cols.default")}>{c.isDefault ? <Chip tone="navy">{t("default")}</Chip> : <ActionButton>{t("makeDefault")}</ActionButton>}</Cell>
              <Cell label={t("cols.state")}><Chip tone={c.active ? "good" : "quiet"}>{c.active ? t("active") : t("inactive")}</Chip></Cell>
              <Cell align="right"><ActionButton>{t("edit")}</ActionButton></Cell>
            </Row>
          ))}
        </Table>
      )}
      {tab === "zones" && (
        <Table
          columns={[
            { key: "name", label: t("cols.zone"), width: "minmax(160px,1fr)" },
            { key: "city", label: t("cols.city"), width: "120px" },
            { key: "kind", label: t("cols.kind"), width: "130px" },
            { key: "surge", label: t("cols.surge"), width: "100px", align: "right" },
            { key: "allies", label: t("cols.allies"), width: "100px", align: "right" },
            { key: "state", label: t("cols.state"), width: "100px" },
          ]}
        >
          {zones.map((z) => (
            <Row key={z.id}>
              <Cell>{z.name}</Cell>
              <Cell label={t("cols.city")}>{cityName(z.cityId)}</Cell>
              <Cell label={t("cols.kind")}><Chip tone={z.kind === "airport" ? "navy" : z.kind === "restricted" ? "danger" : "neutral"}>{e(`zoneKind.${z.kind}`)}</Chip></Cell>
              <Cell label={t("cols.surge")} align="right"><span style={{ color: z.surge > 1 ? "var(--warn)" : undefined }}>×{num(z.surge, locale, 2)}</span></Cell>
              <Cell label={t("cols.allies")} align="right">{z.allies}</Cell>
              <Cell label={t("cols.state")}><Chip tone={z.active ? "good" : "quiet"}>{z.active ? t("active") : t("inactive")}</Chip></Cell>
            </Row>
          ))}
        </Table>
      )}
      {tab === "operators" && (
        <Table
          columns={[
            { key: "name", label: t("cols.operator"), width: "minmax(200px,1fr)" },
            { key: "level", label: t("cols.level"), width: "140px" },
            { key: "dept", label: t("cols.department"), width: "130px" },
            { key: "seen", label: t("cols.lastSeen"), width: "140px" },
            { key: "state", label: t("cols.state"), width: "110px" },
            { key: "action", label: "", width: "120px", align: "right" },
          ]}
          footer={<ActionButton variant="primary">{t("invite")}</ActionButton>}
        >
          {operators.map((o) => (
            <Row key={o.id}>
              <Cell sub={o.email}><span className="inline-flex items-center gap-2"><Avatar name={o.name} size={24} /> {o.name}</span></Cell>
              <Cell label={t("cols.level")}>{e(`level.${o.level}`)}</Cell>
              <Cell label={t("cols.department")}>{e(`department.${o.department}`)}</Cell>
              <Cell label={t("cols.lastSeen")}>{o.status === "invited" ? "—" : relative(o.lastSeenAt, locale)}</Cell>
              <Cell label={t("cols.state")}><Chip tone={operatorTone[o.status]}>{e(`operatorStatus.${o.status}`)}</Chip></Cell>
              <Cell align="right">{o.level !== "owner" && <ActionButton>{t("edit")}</ActionButton>}</Cell>
            </Row>
          ))}
        </Table>
      )}
      {tab === "security" && (
        <Card>
          <CardHead title={t("security.title")} />
          <KeyValues
            rows={[
              [t("security.idle"), t("security.idleValue", { n: IDLE_MINUTES })],
              [t("security.session"), t("security.sessionValue")],
              [t("security.password"), t("security.passwordValue")],
            ]}
          />
        </Card>
      )}
    </>
  );
}
