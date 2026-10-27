import type { CSSProperties, ReactNode } from "react";

// Card and Notice reproduce the live console's components (same borders, radii and tones).
const borders = { neutral: "1px solid var(--hairline)", warn: "1.5px solid var(--warn)", danger: "1.5px solid var(--danger)" };

export function Card({ tone = "neutral", className = "", style, children, role }: { tone?: keyof typeof borders; className?: string; style?: CSSProperties; children: ReactNode; role?: string }) {
  return (
    <div className={className} role={role} style={{ background: "var(--card-bg)", border: borders[tone], borderRadius: "var(--radius-card)", boxSizing: "border-box", ...style }}>
      {children}
    </div>
  );
}

const accents = { warn: "var(--warn)", danger: "var(--danger)", good: "var(--green)", neutral: "var(--quiet-border)" };
export type NoticeTone = keyof typeof accents;

export function Notice({ tone = "warn", label, children, className = "", style, role }: { tone?: NoticeTone; label?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties; role?: string }) {
  return (
    <Card className={className} role={role} style={{ borderLeft: `3px solid ${accents[tone]}`, padding: "var(--band-pad)", ...style }}>
      {label && (
        <p className="uppercase" style={{ fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "10.5px", letterSpacing: "1.8px", color: accents[tone], marginBottom: "4px" }}>
          {label}
        </p>
      )}
      <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--fs-body)", color: "var(--ink)", lineHeight: 1.45 }}>{children}</div>
    </Card>
  );
}

export function CardHead({ title, eyebrow, action }: { title: ReactNode; eyebrow?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3" style={{ padding: "var(--band-pad)", borderBottom: "1px solid var(--hairline)" }}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="font-display" style={{ fontSize: "var(--fs-card-title)", fontWeight: 500, color: "var(--ink)" }}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Eyebrow({ children, small, style }: { children: ReactNode; small?: boolean; style?: CSSProperties }) {
  return (
    <p className="uppercase" style={{ fontFamily: "var(--font-label)", fontWeight: 500, fontSize: small ? "var(--fs-eyebrow-sm)" : "var(--fs-eyebrow)", letterSpacing: "2px", color: "var(--muted2)", ...style }}>
      {children}
    </p>
  );
}
