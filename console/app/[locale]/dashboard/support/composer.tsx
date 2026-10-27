"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/controls";

export function Composer() {
  const t = useTranslations("console.support");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setText("");
        setSent(true);
        setTimeout(() => setSent(false), 2000);
      }}
      className="flex items-end gap-2"
      style={{ padding: "var(--band-pad)", borderTop: "1px solid var(--hairline)" }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder={t("placeholder")}
        className="min-w-0 flex-1 resize-none focus:outline-none"
        style={{ border: "1px solid var(--field)", borderRadius: "var(--radius-control)", padding: "8px 10px", fontSize: "var(--fs-body)" }}
      />
      <Button variant="primary" type="submit">{sent ? t("sent") : t("send")}</Button>
    </form>
  );
}
