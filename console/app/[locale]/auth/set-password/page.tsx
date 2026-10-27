"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ErrorNote } from "@/components/ui/error-note";
import { setPassword } from "@/lib/auth/client";
import { authRefusalKey } from "@/lib/auth/refusal";
import { AuthCard, inputStyle, labelStyle } from "../../login/auth-card";

// Where the reset e-mail's link lands (redirectTo = /{locale}/auth/set-password).
export default function SetPasswordPage() {
  const t = useTranslations("console.setPassword");
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | { text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pw !== again) return setError({ text: t("mismatch") });
    setBusy(true);
    setError(null);
    const { error } = await setPassword(pw);
    setBusy(false);
    if (error) return setError(authRefusalKey(error) ?? "unknown");
    router.replace("/dashboard");
  }

  return (
    <AuthCard path="/auth/set-password">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <h2 className="mb-1 text-lg font-semibold">{t("title")}</h2>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t("description")}</p>
        </div>
        <ErrorNote error={error} />
        <div>
          <label htmlFor="pw" style={labelStyle}>{t("password")}</label>
          <input id="pw" type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-full focus:outline-none" style={inputStyle(!!error)} />
        </div>
        <div>
          <label htmlFor="pw2" style={labelStyle}>{t("again")}</label>
          <input id="pw2" type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="w-full focus:outline-none" style={inputStyle(!!error)} />
        </div>
        <button type="submit" disabled={busy} className="w-full transition disabled:opacity-50" style={{ background: "var(--navy)", color: "var(--white)", borderRadius: "var(--radius-control)", padding: "13px 16px", fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "14px" }}>
          {busy ? t("saving") : t("submit")}
        </button>
      </form>
    </AuthCard>
  );
}
