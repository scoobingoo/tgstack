import type { Locale } from "@tgstack/i18n";

const intlLocale = (locale: Locale) => (locale === "vi" ? "vi-VN" : "en-GB");

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/** "Ada Lovelace (@ada)" */
export function displayName(user: {
  firstName: string;
  lastName?: string | null;
  username?: string | null;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.username ? `${name} (@${user.username})` : name;
}

/** "120 ⭐" for Telegram Stars, "50.000 ₫" for VND, "12 EUR" otherwise. */
export function formatMoney(amount: number, currency: string, locale: Locale): string {
  if (currency === "XTR") return `${formatNumber(amount, locale)} ⭐`;
  if (currency === "VND") return `${formatNumber(amount, locale)} ₫`;
  return `${formatNumber(amount, locale)} ${currency}`;
}
