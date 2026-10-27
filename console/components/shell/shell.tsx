"use client";
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/client";
import { nav } from "./nav";
import { IdleGuard } from "./idle-guard";

type Badges = Partial<Record<"alerts" | "support" | "disputes" | "approvals", number>>;
const LOCALES = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
] as const;

export function Shell({ children, operator, badges, demo }: { children: ReactNode; operator: { name: string; email: string; level: string }; badges: Badges; demo: boolean }) {
  const t = useTranslations("console");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      <div className="console-topbar">
        <button type="button" className="console-menu-button" aria-label={t("shell.menu")} onClick={() => setOpen(true)}>
          ☰
        </button>
        <Image src="/mark-white.png" alt="" width={57} height={64} style={{ height: 22, width: "auto" }} />
        <span className="console-topbar-name">Confiance</span>
      </div>
      <div className="console-scrim" data-open={open} onClick={() => setOpen(false)} />
      <Rail open={open} badges={badges} operator={operator} demo={demo} />
      <main className="console-main min-w-0 flex-1" style={{ padding: "var(--content-pad)" }}>
        {children}
      </main>
      <IdleGuard />
    </div>
  );
}

function Rail({ open, badges, operator, demo }: { open: boolean; badges: Badges; operator: { name: string; email: string; level: string }; demo: boolean }) {
  const t = useTranslations("console");
  const pathname = usePathname();
  const locale = useLocale();
  const router = useRouter();
  const isActive = (href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <aside className="console-rail flex shrink-0 flex-col" data-open={open} style={{ width: "var(--rail-w)", background: "var(--navy)", color: "var(--rail-ink)" }}>
      <div className="flex items-center gap-2.5" style={{ padding: "var(--rail-head-pad)", borderBottom: "1px solid var(--rail-divider)" }}>
        <Image src="/mark-white.png" alt="" width={57} height={64} style={{ height: "var(--rail-logo-h)", width: "auto" }} priority />
        <div className="leading-tight">
          <p style={{ fontFamily: "var(--font-label)", fontWeight: 500, letterSpacing: "2.4px", textTransform: "uppercase", fontSize: "var(--fs-wordmark)" }}>Confiance</p>
          <p style={{ fontFamily: "var(--font-label)", letterSpacing: "1.6px", textTransform: "uppercase", fontSize: "9px", color: "var(--rail-label)" }}>{t("shell.operations")}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto" style={{ paddingBottom: 12 }}>
        {nav.map((g) => (
          <div key={g.key} style={{ marginTop: 8 }}>
            <p className="uppercase" style={{ padding: "var(--rail-group-pad)", fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "9.5px", letterSpacing: "1.8px", color: "var(--rail-label)" }}>
              {t(`nav.groups.${g.key}`)}
            </p>
            {g.items.map((i) => {
              const on = isActive(i.href);
              const n = i.badge ? badges[i.badge] : undefined;
              return (
                <Link
                  key={i.key}
                  href={i.href}
                  aria-current={on ? "page" : undefined}
                  className="rail-link flex items-center justify-between transition-colors"
                  style={{ height: "var(--rail-item-h)", padding: "0 20px", fontSize: "var(--fs-body)", color: on ? "var(--rail-ink)" : "var(--rail-ink-quiet)", background: on ? "var(--rail-active)" : undefined, borderLeft: on ? "2px solid var(--white)" : "2px solid transparent" }}
                >
                  <span>{t(`nav.${i.key}`)}</span>
                  {n ? (
                    <span style={{ minWidth: 18, padding: "0 5px", height: 16, borderRadius: 99, background: i.badge === "alerts" ? "var(--danger)" : "rgba(255,255,255,.18)", fontSize: 10, fontFamily: "var(--font-label)", fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ borderTop: "1px solid var(--rail-divider)", padding: "12px 20px 16px" }}>
        {demo && <p style={{ fontSize: 10.5, color: "var(--rail-label)", marginBottom: 8 }}>{t("shell.demo")}</p>}
        <p className="truncate" style={{ fontSize: "var(--fs-body)", fontWeight: 500 }}>{operator.name}</p>
        <p className="truncate" style={{ fontSize: 11, color: "var(--rail-ink-quiet)" }}>{operator.email}</p>
        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex gap-2" style={{ fontSize: 11 }}>
            {LOCALES.map((l) =>
              l.code === locale ? (
                <span key={l.code} style={{ color: "var(--rail-ink)" }}>{l.label}</span>
              ) : (
                <Link key={l.code} href={pathname} locale={l.code} style={{ color: "var(--rail-label)" }} className="hover:underline">
                  {l.label}
                </Link>
              ),
            )}
          </div>
          <button
            type="button"
            className="hover:underline"
            style={{ fontSize: 11, color: "var(--rail-ink-quiet)" }}
            onClick={async () => {
              await signOut();
              router.replace("/login");
              router.refresh();
            }}
          >
            {t("shell.signOut")}
          </button>
        </div>
      </div>
    </aside>
  );
}
