import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { Eyebrow } from "./card";

export function PageHeader({ eyebrow, title, sub, actions, back }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3" style={{ marginBottom: "var(--section-gap)" }}>
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="hover:underline" style={{ fontFamily: "var(--font-label)", fontSize: "var(--fs-caption)", color: "var(--green)", fontWeight: 500 }}>
            ← {back.label}
          </Link>
        )}
        {eyebrow && <Eyebrow style={{ marginTop: back ? 6 : 0 }}>{eyebrow}</Eyebrow>}
        <h1 className="font-display" style={{ fontSize: "var(--fs-page-title)", fontWeight: 400, color: "var(--ink)", marginTop: "var(--title-mt)" }}>
          {title}
        </h1>
        {sub && <p style={{ color: "var(--muted2)", fontSize: "var(--fs-caption)", marginTop: 2 }}>{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={className} style={{ marginBottom: "var(--section-gap)" }}>{children}</section>;
}

export function Blocks({ children, cols = "minmax(0,1fr) var(--right-col-w)" }: { children: ReactNode; cols?: string }) {
  return (
    <div className="console-blocks grid items-start" style={{ gridTemplateColumns: cols, gap: "var(--section-gap)" }}>
      {children}
    </div>
  );
}
