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
