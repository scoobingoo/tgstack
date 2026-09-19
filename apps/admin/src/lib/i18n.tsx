"use client";

import { createTranslator, isLocale, type Locale, type Translate } from "@tgstack/i18n";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

/** Cookie read by the root layout so the server renders `<html lang>` in the right language. */
export const LOCALE_COOKIE = "admin_locale";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      if (!isLocale(next)) return;
      // biome-ignore lint/suspicious/noDocumentCookie: a plain preference cookie, read by the server layout.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      setLocaleState(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: createTranslator(locale, "admin") }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}

/** Translate function for the admin namespace (`packages/i18n/locales/<locale>/admin.ftl`). */
export function useT(): Translate {
  return useI18n().t;
}
