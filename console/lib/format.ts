const TZ = "Africa/Douala";
const tag = (locale: string) => (locale === "zh" ? "zh-CN" : locale === "en" ? "en-GB" : "fr-FR");

export function money(n: number, locale: string) {
  return new Intl.NumberFormat(tag(locale), { style: "currency", currency: "XAF", maximumFractionDigits: 0 }).format(n);
}
export function num(n: number, locale: string, digits = 0) {
  return new Intl.NumberFormat(tag(locale), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}
export function pct(n: number, locale: string) {
  return new Intl.NumberFormat(tag(locale), { style: "percent", maximumFractionDigits: 0 }).format(n);
}
export function dateTime(iso: string, locale: string) {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
export function date(iso: string, locale: string) {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}
export function time(iso: string, locale: string) {
  return new Intl.DateTimeFormat(tag(locale), { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
export function relative(iso: string, locale: string) {
  const diff = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: "auto" });
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(Math.round(diff), "second");
  if (a < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}
export function daysFromNow(iso: string) {
  return Math.round((Date.parse(iso) - Date.now()) / 86400000);
}
export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
