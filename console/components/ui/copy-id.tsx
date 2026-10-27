"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";

export function CopyId({ id }: { id: string }) {
  const t = useTranslations("common");
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
          setState("done");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 1500);
      }}
      className="font-mono hover:underline"
      title={t("copyId")}
      style={{ fontSize: "var(--fs-mono)", color: "var(--muted2)" }}
    >
      {state === "done" ? t("copiedId") : state === "failed" ? t("copyFailed") : id}
    </button>
  );
}
