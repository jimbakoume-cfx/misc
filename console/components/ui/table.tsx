import type { CSSProperties, ReactNode } from "react";
import { Link } from "@/i18n/navigation";

// Grid table: the column template comes from the stylesheet's per-table widths (e.g. --trip-when),
// so a table lines up the way it does on the live console. On phones each row becomes a stacked card
// and every cell shows its own label.
export type Column = { key: string; label: ReactNode; width: string; align?: "left" | "right" | "center" };

const head: CSSProperties = {
  fontFamily: "var(--font-label)",
  fontWeight: 500,
  fontSize: "var(--fs-eyebrow)",
  letterSpacing: "1.6px",
  textTransform: "uppercase",
  color: "var(--muted2)",
};

export function Table({ columns, children, empty, footer }: { columns: Column[]; children: ReactNode; empty?: ReactNode; footer?: ReactNode }) {
  const template = columns.map((c) => c.width).join(" ");
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div role="table" style={{ background: "var(--card-bg)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
      <div role="row" className="console-colhead grid items-center" style={{ gridTemplateColumns: template, padding: "var(--table-pad)", borderBottom: "1px solid var(--hairline)", columnGap: 12 }}>
        {columns.map((c) => (
          <div role="columnheader" key={c.key} style={{ ...head, textAlign: c.align ?? "left" }}>
            {c.label}
          </div>
        ))}
      </div>
      <TemplateContext template={template}>{hasRows ? children : <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--muted2)" }}>{empty}</div>}</TemplateContext>
      {footer && <div style={{ borderTop: "1px solid var(--hairline)", padding: "var(--table-pad)" }}>{footer}</div>}
    </div>
  );
}

function TemplateContext({ template, children }: { template: string; children: ReactNode }) {
  return <div style={{ ["--row-template" as string]: template }}>{children}</div>;
}

export function Row({ href, children, style, highlight }: { href?: string; children: ReactNode; style?: CSSProperties; highlight?: boolean }) {
  const s: CSSProperties = {
    gridTemplateColumns: "var(--row-template)",
    padding: "var(--table-pad)",
    minHeight: "var(--row-min-h)",
    borderBottom: "1px solid var(--hairline)",
    columnGap: 12,
    fontSize: "var(--fs-cell)",
    color: "var(--ink)",
    background: highlight ? "var(--warn12)" : undefined,
    ...style,
  };
  if (href)
    return (
      <Link role="row" href={href} className="console-row row-link grid items-center transition-colors" style={s}>
        {children}
      </Link>
    );
  return (
    <div role="row" className="console-row grid items-center" style={s}>
      {children}
    </div>
  );
}

export function Cell({ label, children, align, sub, mono }: { label?: ReactNode; children: ReactNode; align?: "left" | "right" | "center"; sub?: ReactNode; mono?: boolean }) {
  return (
    <div role="cell" className="min-w-0" style={{ textAlign: align ?? "left" }}>
      {label && <span className="console-cell-label">{label}</span>}
      <span className={mono ? "font-mono" : ""} style={{ fontSize: mono ? "var(--fs-mono)" : undefined }}>
        {children}
      </span>
      {sub && <div className="truncate" style={{ fontSize: "var(--fs-cell-sub)", color: "var(--muted2)", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
