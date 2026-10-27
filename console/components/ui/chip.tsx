import type { ReactNode } from "react";

export type Tone = "good" | "warn" | "danger" | "neutral" | "navy" | "quiet";
const tones: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: "var(--green12)", fg: "var(--green)" },
  warn: { bg: "var(--warn12)", fg: "var(--warn)" },
  danger: { bg: "var(--danger12)", fg: "var(--danger)" },
  neutral: { bg: "var(--surface-quiet)", fg: "var(--muted-ink)" },
  navy: { bg: "var(--navy)", fg: "var(--white)" },
  quiet: { bg: "transparent", fg: "var(--muted2)" },
};

export function Chip({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  const c = tones[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap uppercase"
      style={{ background: c.bg, color: c.fg, borderRadius: "var(--radius-chip)", padding: "2px 7px", fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "var(--fs-chip)", letterSpacing: "1px", border: tone === "quiet" ? "1px solid var(--quiet-border)" : undefined }}
    >
      {dot && <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: c.fg }} />}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  return <span aria-hidden className={pulse ? "marker-pulse" : ""} style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, background: tones[tone].fg }} />;
}
