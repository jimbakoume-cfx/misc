import { defineRouting } from "next-intl/routing";

export const locales = ["fr", "en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "fr",
  localePrefix: "always",
});
