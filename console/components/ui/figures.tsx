import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { Card, Eyebrow } from "./card";

export function Tile({ label, figure, sub, tone, href }: { label: ReactNode; figure: ReactNode; sub?: ReactNode; tone?: "warn" | "danger" | "good"; href?: string }) {
  const color = tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : tone === "good" ? "var(--green)" : "var(--ink)";
  const body = (
    <Card style={{ padding: "var(--tile-pad)", height: "100%" }} className={href ? "row-link transition-colors" : ""}>
      <p style={{ fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "var(--fs-tile-label)", color: "var(--muted2)" }}>{label}</p>
      <p className="font-display" style={{ fontSize: "var(--fs-figure-tile)", color, lineHeight: 1.1, marginTop: 2 }}>{figure}</p>
      {sub && <p style={{ fontSize: "var(--fs-tile-sub)", color: "var(--muted2)", marginTop: 2 }}>{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Tiles({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: "var(--card-gap)", marginBottom: "var(--section-gap)" }}>
      {children}
    </div>
  );
}

export function Hero({ label, figure, sub }: { label: ReactNode; figure: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className="font-display" style={{ fontSize: "var(--fs-figure-hero)", fontWeight: 300, color: "var(--ink)", lineHeight: 1.05 }}>{figure}</p>
      {sub && <p style={{ fontSize: "var(--fs-caption)", color: "var(--muted2)" }}>{sub}</p>}
    </div>
  );
}

export function Bars({ values, labels, highlight }: { values: number[]; labels: string[]; highlight?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ padding: "var(--chart-pad)" }}>
      <div className="flex items-end" style={{ height: "var(--chart-bar-h)", gap: "var(--chart-gap)" }}>
        {values.map((v, i) => (
          <div key={i} title={`${labels[i]} · ${v}`} className="flex-1" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: i === highlight ? "var(--chart-1)" : "var(--chart-4)", borderRadius: "2px 2px 0 0" }} />
        ))}
      </div>
      <div className="flex" style={{ gap: "var(--chart-gap)", marginTop: 4 }}>
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center" style={{ fontSize: "var(--fs-chart-label)", color: "var(--faint)", fontFamily: "var(--font-label)" }}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ListRow({ label, count, href, tone }: { label: ReactNode; count: ReactNode; href: string; tone?: "warn" | "danger" }) {
  return (
    <Link href={href} className="row-link flex items-center justify-between gap-3 transition-colors" style={{ padding: "var(--list-row-pad)", borderBottom: "1px solid var(--hairline)" }}>
      <span style={{ fontSize: "var(--fs-list-label)", color: "var(--ink)" }}>{label}</span>
      <span className="flex items-center gap-3">
        <span className="font-display" style={{ fontSize: "var(--fs-list-count)", color: tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--ink)" }}>{count}</span>
        <span aria-hidden style={{ fontSize: "var(--fs-list-chevron)", color: "var(--faint)" }}>›</span>
      </span>
    </Link>
  );
}

export function Counter({ label, figure, tone }: { label: ReactNode; figure: ReactNode; tone?: "warn" | "danger" | "good" }) {
  const color = tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : tone === "good" ? "var(--green)" : "var(--ink)";
  return (
    <div style={{ padding: "var(--counter-pad)", borderRight: "1px solid var(--hairline)" }} className="flex-1">
      <p className="uppercase" style={{ fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "var(--fs-counter-label)", letterSpacing: "1.4px", color: "var(--muted2)" }}>{label}</p>
      <p className="font-display" style={{ fontSize: "var(--fs-counter-figure)", color, lineHeight: 1.1 }}>{figure}</p>
    </div>
  );
}
