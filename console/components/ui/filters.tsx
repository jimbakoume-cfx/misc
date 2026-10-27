"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export type Field =
  | { kind: "search"; name: string; width: string; placeholder: string }
  | { kind: "select"; name: string; width: string; label: string; options: { value: string; label: string }[] }
  | { kind: "dates"; width: string };

const control = {
  height: "var(--filter-h)",
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--field)",
  background: "var(--white)",
  color: "var(--ink)",
  fontSize: "var(--fs-control)",
  padding: "0 10px",
  fontFamily: "var(--font-body)",
} as const;

// Filters live in the URL, so a filtered list can be shared or reloaded, and the server renders it.
export function FilterBar({ fields }: { fields: Field[] }) {
  const t = useTranslations("console.filters");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  function set(next: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
    p.delete("page");
    const qs = p.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }
  const any = fields.some((f) => (f.kind === "dates" ? params.get("from") || params.get("to") : params.get(f.name)));

  return (
    <div className="flex flex-wrap items-center" style={{ gap: "var(--filter-gap)", marginBottom: "var(--section-gap)", opacity: pending ? 0.7 : 1 }}>
      {fields.map((f, i) =>
        f.kind === "search" ? (
          <Search key={i} name={f.name} width={f.width} placeholder={f.placeholder} initial={params.get(f.name) ?? ""} onChange={(v) => set({ [f.name]: v })} />
        ) : f.kind === "select" ? (
          <select key={i} aria-label={f.label} value={params.get(f.name) ?? ""} onChange={(e) => set({ [f.name]: e.target.value })} style={{ ...control, width: f.width }}>
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <div key={i} className="flex items-center gap-1" style={{ ...control, width: "auto", minWidth: f.width, padding: "0 6px" }}>
            <input type="date" aria-label={t("from")} value={params.get("from") ?? ""} onChange={(e) => set({ from: e.target.value })} className="bg-transparent outline-none" style={{ fontSize: "var(--fs-control)" }} />
            <span style={{ color: "var(--faint)" }}>→</span>
            <input type="date" aria-label={t("to")} value={params.get("to") ?? ""} onChange={(e) => set({ to: e.target.value })} className="bg-transparent outline-none" style={{ fontSize: "var(--fs-control)" }} />
          </div>
        ),
      )}
      {any && (
        <button type="button" onClick={() => start(() => router.replace(pathname, { scroll: false }))} className="hover:underline" style={{ color: "var(--green)", fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "var(--fs-caption)" }}>
          {t("reset")}
        </button>
      )}
    </div>
  );
}

function Search({ name, width, placeholder, initial, onChange }: { name: string; width: string; placeholder: string; initial: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(initial);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => onChange(v), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  return <input type="search" name={name} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} className="filter-input" style={{ ...control, width }} />;
}
