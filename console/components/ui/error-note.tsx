"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Notice } from "./card";

// A refusal is either a sentence already written ({ text }) or a code the API returned, looked up in messages.errors.
export type Refusal = { text: string } | string | null;

export function ErrorNote({ error, tone = "error", className = "" }: { error: Refusal; tone?: "error" | "warning"; className?: string }) {
  const t = useTranslations("errors");
  const [open, setOpen] = useState(false);
  if (!error) return null;
  let sentence: string;
  let detail: string | null = null;
  if (typeof error === "object") sentence = error.text;
  else {
    const key = error.trim().toLowerCase();
    sentence = t.has(key) ? t(key) : t("unrecognised");
    detail = t.has(`detail.${key}`) ? t(`detail.${key}`) : null;
  }
  return (
    <Notice tone={tone === "warning" ? "warn" : "danger"} className={className} role="alert">
      <p>{sentence}</p>
      {detail && (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs underline opacity-80 hover:opacity-100">
            {open ? t("hideDetail") : t("showDetail")}
          </button>
          {open && <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs opacity-80">{detail}</pre>}
        </>
      )}
    </Notice>
  );
}
