import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Link } from "@/i18n/navigation";

type Variant = "primary" | "quiet" | "danger" | "good";
function look(v: Variant): CSSProperties {
  const base: CSSProperties = {
    height: "var(--button-h)",
    padding: "var(--btn-pad)",
    borderRadius: "var(--radius-button)",
    fontFamily: "var(--font-label)",
    fontWeight: 500,
    fontSize: "var(--fs-button)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
  };
  if (v === "primary") return { ...base, background: "var(--navy)", color: "var(--white)", border: "1px solid var(--navy)" };
  if (v === "danger") return { ...base, background: "var(--white)", color: "var(--danger)", border: "1px solid var(--danger)" };
  if (v === "good") return { ...base, background: "var(--green)", color: "var(--white)", border: "1px solid var(--green)" };
  return { ...base, background: "var(--white)", color: "var(--ink)", border: "1px solid var(--quiet-border)" };
}

export function Button({ variant = "quiet", style, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...rest} className={`transition disabled:opacity-50 ${rest.className ?? ""}`} style={{ ...look(variant), ...style }} />;
}

export function LinkButton({ href, variant = "quiet", children }: { href: string; variant?: Variant; children: ReactNode }) {
  return (
    <Link href={href} className="transition hover:opacity-90" style={look(variant)}>
      {children}
    </Link>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: ReactNode; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-1" style={{ marginBottom: "var(--section-gap)" }}>
      {items.map((i) => {
        const on = i.key === active;
        return (
          <Link
            key={i.key}
            href={i.href}
            className="inline-flex items-center gap-2 transition"
            style={{
              height: "var(--tab-h)",
              padding: "var(--tab-pad)",
              borderRadius: "var(--radius-button)",
              fontFamily: "var(--font-label)",
              fontWeight: 500,
              fontSize: "var(--fs-control)",
              background: on ? "var(--navy)" : "transparent",
              color: on ? "var(--white)" : "var(--muted-ink)",
              border: on ? "1px solid var(--navy)" : "1px solid var(--quiet-border)",
            }}
          >
            {i.label}
            {i.count !== undefined && <span style={{ opacity: 0.75, fontSize: "var(--fs-chip)" }}>{i.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Pager({ page, pageSize, total, hrefFor, label }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string; label: string }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2" style={{ fontSize: "var(--fs-caption)", color: "var(--muted2)" }}>
      <span>{label}</span>
      <div className="flex gap-2">
        {page > 1 && <LinkButton href={hrefFor(page - 1)}>←</LinkButton>}
        <span style={{ alignSelf: "center" }}>
          {page} / {last}
        </span>
        {page < last && <LinkButton href={hrefFor(page + 1)}>→</LinkButton>}
      </div>
    </div>
  );
}

export function KeyValues({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid" style={{ gridTemplateColumns: "minmax(110px, 40%) 1fr", rowGap: 8, columnGap: 12, padding: "var(--band-pad)", fontSize: "var(--fs-cell)" }}>
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt style={{ color: "var(--muted2)" }}>{k}</dt>
          <dd className="min-w-0 break-words" style={{ color: "var(--ink)" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Avatar({ name, size = 32, src }: { name: string; size?: number; src?: string }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: 99, background: src ? `center/cover url(${src})` : "var(--tint)", border: "1px solid var(--hairline)", color: "var(--navy)", fontFamily: "var(--font-label)", fontWeight: 500, fontSize: size * 0.36 }}
    >
      {!src && letters}
    </span>
  );
}
