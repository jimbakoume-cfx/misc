"use client";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ErrorNote } from "@/components/ui/error-note";
import { Notice } from "@/components/ui/card";
import { sendResetLink, signIn } from "@/lib/auth/client";
import { authRefusalKey } from "@/lib/auth/refusal";
import { safeNext } from "@/lib/auth/safe-next";
import { AuthCard, inputStyle, labelStyle } from "./auth-card";

type Note = { text: string } | null;

// Why the operator landed here (?error= from the access check, ?reason= from a session that ended).
function ArrivalNote({ suppressed }: { suppressed: boolean }) {
  const t = useTranslations("login");
  const q = useSearchParams();
  const error = q.get("error");
  const reason = q.get("reason");
  const text =
    error === "not_admin" ? t("notAdmin") : error === "inactive" ? t("inactive") : error === "lookup_failed" ? t("lookupFailed") : reason === "idle" ? t("sessionIdle") : reason === "ended" ? t("sessionEnded") : null;
  if (!text || suppressed) return null;
  return <ErrorNote error={{ text }} tone="warning" />;
}

export function LoginForm() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("login");
  const errors = useTranslations("errors");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const resetTarget = () => `${window.location.origin}/${locale}/auth/set-password`;

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const { error } = await sendResetLink(email, resetTarget());
    setBusy(false);
    if (error) {
      if (authRefusalKey(error) === "tooManyRequests") {
        setNote({ text: t("forgot.tooSoon") });
        setWait(60);
        return;
      }
      setNote({ text: t("serverError") });
      return;
    }
    setSentTo(email);
    setSent(true);
    setWait(60);
  }

  async function sendAgain() {
    if (wait > 0) return;
    setBusy(true);
    setNote(null);
    const { error } = await sendResetLink(sentTo, resetTarget());
    setBusy(false);
    if (error && authRefusalKey(error) !== "tooManyRequests") setNote({ text: t("serverError") });
    else setWait(60);
  }

  function backToLogin() {
    setMode("login");
    setNote(null);
    setSent(false);
    setWait(0);
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const { error } = await signIn(email, password);
    if (error) {
      const key = authRefusalKey(error, { signIn: true });
      setNote({ text: key === "signInRefused" ? t("refused") : key === "tooManyRequests" ? errors("tooManyRequests") : t("serverError") });
      setBusy(false);
      return;
    }
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    // `next` already carries its locale; the router adds one to bare paths.
    if (next) window.location.assign(next);
    else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <AuthCard>
      {mode === "login" ? (
        <form onSubmit={onSignIn} className="space-y-4">
          <p className="text-center" style={{ fontFamily: "var(--font-body)", fontSize: "var(--fs-body)", color: "var(--ink)" }}>
            {t("signInPrompt")}
          </p>
          <Suspense fallback={null}>
            <ArrivalNote suppressed={!!note} />
          </Suspense>
          <ErrorNote error={note} />
          <div>
            <label htmlFor="email" style={labelStyle}>{t("email")}</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full transition focus:outline-none" style={inputStyle(!!note)} />
          </div>
          <div>
            <label htmlFor="password" style={labelStyle}>{t("password")}</label>
            <input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full transition focus:outline-none" style={inputStyle(!!note)} />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--navy)", color: "var(--white)", borderRadius: "var(--radius-control)", padding: "13px 16px", fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "14px", marginTop: "8px" }}
          >
            {busy ? t("submitting") : t("submit")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setPassword("");
              setNote(null);
              setSent(false);
              setWait(0);
            }}
            className="w-full text-center hover:underline"
            style={{ color: "var(--green)", fontFamily: "var(--font-label)", fontWeight: 500, fontSize: "13px", paddingTop: "4px" }}
          >
            {t("forgotPassword")}
          </button>
        </form>
      ) : (
        <form onSubmit={onForgot} className="space-y-4">
          {sent ? (
            <div className="space-y-4 py-1">
              <Notice tone="good">
                <p style={{ fontWeight: 500 }}>
                  {t.rich("forgot.ifWeHold", { email: sentTo, addr: (c) => <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)" }}>{c}</span> })}
                </p>
                <p style={{ color: "var(--muted2)", marginTop: "4px" }}>{t("forgot.lastsAnHour")}</p>
              </Notice>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{t("forgot.askASuperAdmin")}</p>
              <ErrorNote error={note} />
              <button type="button" onClick={backToLogin} className="w-full rounded-lg py-2.5 font-medium transition" style={{ background: "var(--white)", border: "1px solid var(--quiet-border)", color: "var(--ink)" }}>
                {t("forgot.backToLogin")}
              </button>
              {wait > 0 ? (
                <p className="text-center text-sm" style={{ color: "var(--muted2)" }} aria-live="polite">
                  {t("forgot.sendAgainIn", { time: mmss(wait) })}
                </p>
              ) : (
                <button type="button" onClick={sendAgain} disabled={busy} className="w-full text-center text-sm hover:underline disabled:opacity-50" style={{ color: "var(--green)" }}>
                  {busy ? t("forgot.submitting") : t("forgot.sendAgain")}
                </button>
              )}
            </div>
          ) : (
            <>
              <div>
                <h2 className="mb-1 text-lg font-semibold" style={{ color: "var(--foreground)" }}>{t("forgot.title")}</h2>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{t("forgot.description")}</p>
              </div>
              <div>
                <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium" style={{ color: "var(--foreground)" }}>{t("forgot.yourAddress")}</label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-foreground transition focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green12)] focus:outline-none"
                />
              </div>
              <ErrorNote error={note} />
              <button type="submit" disabled={busy} className="w-full rounded-lg bg-navy py-2.5 font-medium text-white transition hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? t("forgot.submitting") : t("forgot.submit")}
              </button>
              <button type="button" onClick={backToLogin} className="w-full text-sm hover:underline" style={{ color: "var(--green)" }}>
                {t("forgot.backToLogin")}
              </button>
            </>
          )}
        </form>
      )}
    </AuthCard>
  );
}
