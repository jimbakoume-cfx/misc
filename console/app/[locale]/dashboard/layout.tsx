import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell/shell";
import { currentOperator } from "@/lib/auth/session";
import { authMode } from "@/lib/auth/config";
import { listAlerts, listConversations, listDisputes, listOrders } from "@/lib/data";

export default async function DashboardLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const operator = await currentOperator();
  if (!operator) redirect(`/${locale}/login?reason=ended`);
  const [alerts, waiting, disputes, orders] = await Promise.all([listAlerts("open"), listConversations("waiting"), listDisputes("open"), listOrders()]);
  const badges = { alerts: alerts.length, support: waiting.length, disputes: disputes.length, approvals: orders.filter((o) => o.status === "pending_approval").length };
  return (
    <Shell operator={operator} badges={badges} demo={authMode === "demo"}>
      {children}
    </Shell>
  );
}
