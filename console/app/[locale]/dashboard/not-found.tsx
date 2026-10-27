import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/controls";

export default async function NotFound() {
  const t = await getTranslations("console.notFound");
  return (
    <Card style={{ padding: 32, textAlign: "center" }}>
      <h1 className="font-display" style={{ fontSize: "var(--fs-page-title)" }}>{t("title")}</h1>
      <p style={{ color: "var(--muted2)", margin: "6px 0 16px" }}>{t("body")}</p>
      <LinkButton href="/dashboard" variant="primary">{t("back")}</LinkButton>
    </Card>
  );
}
