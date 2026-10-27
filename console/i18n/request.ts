import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

// messages/live/* are the strings served by the live console (login, shared words, every refusal the API can give).
// messages/console/* are this rebuild's own page strings. Chinese falls back to English where a string is missing.
function merge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object"
        ? merge(b as Messages, v as Messages)
        : v;
  }
  return out;
}

async function load(locale: string): Promise<Messages> {
  const live = (await import(`../messages/live/${locale}.json`)).default as Messages;
  const own = (await import(`../messages/console/${locale}.json`)).default as Messages;
  return merge(live, own);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  let messages = await load(locale);
  if (locale === "zh") messages = merge(await load("en"), messages);
  return { locale, messages };
});
