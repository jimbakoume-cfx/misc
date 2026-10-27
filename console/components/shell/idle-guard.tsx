"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { signOut } from "@/lib/auth/client";
import { IDLE_MINUTES } from "@/lib/auth/config";

const WARN_SECONDS = 60;

// Signs the operator out after a stretch without activity, with a minute's warning, then returns them
// to the page they were on after they sign in again (login?reason=idle&next=…), like the live console.
export function IdleGuard() {
  const t = useTranslations("common.idleWarning");
  const router = useRouter();
  const pathname = usePathname();
  const last = useRef(Date.now());
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const bump = () => {
      if (left === null) last.current = Date.now();
    };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const id = setInterval(async () => {
      const idle = (Date.now() - last.current) / 1000;
      const limit = IDLE_MINUTES * 60;
      if (idle >= limit) {
        clearInterval(id);
        await signOut();
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        router.replace(`/login?reason=idle&next=${next}`);
      } else if (idle >= limit - WARN_SECONDS) setLeft(Math.ceil(limit - idle));
      else setLeft(null);
    }, 1000);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(id);
    };
  }, [left, router, pathname]);

  if (left === null) return null;
  return (
    <div role="alertdialog" aria-modal className="fixed inset-0 z-[70] flex items-center justify-center px-4" style={{ background: "var(--scrim)" }}>
      <div style={{ background: "var(--white)", borderRadius: "var(--radius-card)", padding: "24px 24px 20px", maxWidth: 380, width: "100%" }}>
        <h2 className="font-display" style={{ fontSize: "var(--fs-card-title)" }}>{t("title")}</h2>
        <p style={{ marginTop: 6, color: "var(--muted-ink)" }}>{t("body", { seconds: left })}</p>
        <button
          type="button"
          onClick={() => {
            last.current = Date.now();
            setLeft(null);
          }}
          style={{ marginTop: 16, width: "100%", background: "var(--navy)", color: "var(--white)", borderRadius: "var(--radius-control)", padding: "10px 14px", fontFamily: "var(--font-label)", fontWeight: 500 }}
        >
          {t("stay")}
        </button>
      </div>
    </div>
  );
}
