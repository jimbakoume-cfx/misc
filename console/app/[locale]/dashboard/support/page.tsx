import { getLocale, getTranslations } from "next-intl/server";
import { ActionButton } from "@/components/ui/action";
import { Card, CardHead } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { KeyValues, Tabs } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page";
import { Link } from "@/i18n/navigation";
import { getConversation, listConversations, lookupRider, lookupTrip, riderName } from "@/lib/data";
import { money, relative, time } from "@/lib/format";
import { conversationTone, identityTone, one, qs, type Search } from "@/lib/tones";
import { Composer } from "./composer";

export default async function SupportPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = one(sp.status);
  const t = await getTranslations("console.support");
  const e = await getTranslations("console.enums");
  const locale = await getLocale();
  const all = await listConversations();
  const list = await listConversations(status);
  const current = (await getConversation(one(sp.c) ?? "")) ?? list[0] ?? null;
  const rider = current ? lookupRider(current.riderId) : null;
  const trip = current ? lookupTrip(current.tripId) : null;

  return (
    <>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} sub={t("sub")} />
      <Tabs
        active={status ?? "all"}
        items={[
          { key: "all", label: t("tabs.all"), href: "/dashboard/support", count: all.length },
          { key: "waiting", label: e("conversation.waiting"), href: "/dashboard/support?status=waiting", count: all.filter((c) => c.status === "waiting").length },
          { key: "open", label: e("conversation.open"), href: "/dashboard/support?status=open", count: all.filter((c) => c.status === "open").length },
          { key: "closed", label: e("conversation.closed"), href: "/dashboard/support?status=closed", count: all.filter((c) => c.status === "closed").length },
        ]}
      />
      <div className="console-inbox-rider">
        <div className="console-beside flex min-h-0 flex-1" style={{ gap: "var(--card-gap)" }}>
          <Card className="flex min-h-0 flex-col" style={{ width: "var(--queue-w)", flexShrink: 0 }}>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {list.map((c) => {
                const r = lookupRider(c.riderId);
                const on = c.id === current?.id;
                return (
                  <Link key={c.id} href={`/dashboard/support${qs(sp, { c: c.id })}`} scroll={false} className="row-link block transition-colors" style={{ padding: "var(--queue-row-pad)", borderBottom: "1px solid var(--hairline)", background: on ? "var(--tint)" : undefined, borderLeft: on ? "3px solid var(--navy)" : "3px solid transparent" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate" style={{ fontWeight: c.unread ? 500 : 400 }}>{r ? riderName(r) : "—"}</span>
                      <span style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)", whiteSpace: "nowrap" }}>{relative(c.updatedAt, locale)}</span>
                    </div>
                    <p className="truncate" style={{ fontSize: "var(--fs-cell)", color: "var(--muted-ink)" }}>{c.subject}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Chip tone={conversationTone[c.status]}>{e(`conversation.${c.status}`)}</Chip>
                      <Chip tone="quiet">{e(`channel.${c.channel}`)}</Chip>
                      {c.unread > 0 && <span style={{ marginLeft: "auto", minWidth: 18, height: 18, borderRadius: 99, background: "var(--navy)", color: "white", fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.unread}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card className="flex min-h-0 min-w-0 flex-1 flex-col">
            {current ? (
              <>
                <CardHead
                  eyebrow={`${e(`channel.${current.channel}`)} · ${current.assignee ?? t("unassigned")}`}
                  title={current.subject}
                  action={
                    <div className="flex gap-2">
                      {!current.assignee && <ActionButton variant="primary">{t("take")}</ActionButton>}
                      {current.status !== "closed" && <ActionButton>{t("closeConversation")}</ActionButton>}
                    </div>
                  }
                />
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto" style={{ padding: "var(--band-pad)", background: "var(--screen)" }}>
                  {current.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.from === "agent" ? "justify-end" : m.from === "system" ? "justify-center" : "justify-start"}`}>
                      <div
                        style={{
                          maxWidth: "78%",
                          padding: "8px 12px",
                          borderRadius: 10,
                          background: m.from === "agent" ? "var(--navy)" : m.from === "system" ? "transparent" : "var(--white)",
                          color: m.from === "agent" ? "var(--white)" : m.from === "system" ? "var(--muted2)" : "var(--ink)",
                          border: m.from === "customer" ? "1px solid var(--hairline)" : undefined,
                          fontSize: m.from === "system" ? "var(--fs-cell-sub)" : "var(--fs-body)",
                        }}
                      >
                        <p>{m.body}</p>
                        {m.from !== "system" && <p style={{ fontSize: 10.5, opacity: 0.7, marginTop: 2 }}>{m.author} · {time(m.at, locale)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {current.status !== "closed" && <Composer />}
              </>
            ) : (
              <p style={{ padding: 28, color: "var(--muted2)", textAlign: "center" }}>{t("empty")}</p>
            )}
          </Card>

          <Card className="min-h-0 overflow-y-auto" style={{ width: "var(--right-col-w)", flexShrink: 0 }}>
            <CardHead title={t("customer")} />
            {rider ? (
              <>
                <KeyValues
                  rows={[
                    [t("name"), <Link key="n" href={`/dashboard/riders/${rider.id}`} className="hover:underline" style={{ color: "var(--green)" }}>{riderName(rider)}</Link>],
                    [t("phone"), rider.phone],
                    [t("identity"), <Chip key="i" tone={identityTone[rider.identity]}>{e(`identity.${rider.identity}`)}</Chip>],
                    [t("wallet"), money(rider.wallet, locale)],
                    [t("trips"), rider.trips],
                  ]}
                />
                {trip && (
                  <>
                    <CardHead title={t("trip")} />
                    <KeyValues
                      rows={[
                        [t("ref"), <Link key="t" href={`/dashboard/trips/${trip.id}`} className="font-mono hover:underline" style={{ color: "var(--green)" }}>{trip.ref}</Link>],
                        [t("route"), `${trip.pickup} → ${trip.dropoff}`],
                        [t("charged"), trip.charged ? money(trip.charged, locale) : "—"],
                        [t("status"), e(`tripStatus.${trip.status}`)],
                      ]}
                    />
                  </>
                )}
              </>
            ) : (
              <p style={{ padding: "var(--band-pad)", color: "var(--muted2)" }}>{t("identifyFirst")}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
