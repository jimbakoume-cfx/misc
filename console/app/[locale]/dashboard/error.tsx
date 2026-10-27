"use client";
import { useTranslations } from "next-intl";
import { Notice } from "@/components/ui/card";
import { Button } from "@/components/ui/controls";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <Notice tone="danger">
      <p>{t("loadFailed")}</p>
      <Button style={{ marginTop: 10 }} onClick={reset}>{t("retry")}</Button>
    </Notice>
  );
}
