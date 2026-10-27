import { Fragment, type ReactNode } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const LANGS = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
] as const;

// The white card on navy that frames sign-in and password pages, as on the live console.
export function AuthCard({ children, path = "/login" }: { children: ReactNode; path?: string }) {
  const common = useTranslations("common");
  const t = useTranslations("login");
  const locale = useLocale();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "var(--navy)" }}>
      <div className="w-full max-w-md">
        <div className="overflow-hidden" style={{ background: "var(--white)", borderRadius: "var(--radius-card)", padding: "40px 36px 32px" }}>
          <div className="flex flex-col items-center" style={{ marginBottom: "22px" }}>
            <Image src="/mark-lockup-navy.png" alt={common("appName")} width={196} height={145} priority style={{ width: "150px", height: "auto" }} />
            <p className="uppercase" style={{ fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "11px", letterSpacing: "3.4px", color: "var(--muted2)", marginTop: "14px" }}>
              {t("operationsEyebrow")}
            </p>
            <span aria-hidden="true" style={{ width: "46px", height: "1px", background: "var(--hairline)", marginTop: "14px" }} />
          </div>
          {children}
          <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--hairline)" }}>
            <p className="flex items-center justify-center" style={{ gap: "10px" }}>
              {LANGS.map((l, i) => (
                <Fragment key={l.code}>
                  {i > 0 && <span style={{ color: "var(--faint)" }}>·</span>}
                  {l.code === locale ? (
                    <span style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--ink)" }}>{l.label}</span>
                  ) : (
                    <Link href={path} locale={l.code} style={{ fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--green)" }}>
                      {l.label}
                    </Link>
                  )}
                </Fragment>
              ))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const labelStyle = {
  display: "block",
  fontFamily: "var(--font-label)",
  fontWeight: 500,
  fontSize: "10.5px",
  letterSpacing: "2.2px",
  textTransform: "uppercase",
  color: "var(--muted2)",
  marginBottom: "6px",
} as const;

export function inputStyle(invalid: boolean) {
  return {
    padding: "11px 14px",
    borderRadius: "var(--radius-control)",
    border: `1px solid ${invalid ? "var(--danger)" : "var(--field)"}`,
    background: "var(--white)",
    color: "var(--ink)",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
  } as const;
}
