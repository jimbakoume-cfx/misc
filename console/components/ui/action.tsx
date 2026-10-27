"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "./controls";

// Front-end only: an action button that confirms and reports "Saved." without a backend.
// Wire onRun to the real API call when there is one; a returned string is shown as a refusal code.
export function ActionButton({ children, variant, confirm, onRun }: { children: ReactNode; variant?: "primary" | "quiet" | "danger" | "good"; confirm?: string; onRun?: () => Promise<string | void> }) {
  const t = useTranslations("common");
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant={variant}
        disabled={state === "busy"}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setState("busy");
          const refusal = onRun ? await onRun() : await new Promise<void>((r) => setTimeout(r, 400));
          setState(refusal ? "failed" : "done");
          setTimeout(() => setState("idle"), 2200);
        }}
      >
        {state === "busy" ? t("saving") : children}
      </Button>
      {state === "done" && <span style={{ fontSize: "var(--fs-caption)", color: "var(--green)" }}>{t("actionDone")}</span>}
    </span>
  );
}
