import { useQuery } from "@tanstack/react-query";
import {
  createTranslator,
  DEFAULT_LOCALE,
  type Locale,
  negotiateLocale,
  type Translate,
} from "@tgstack/i18n";
import type { AppMeDto } from "@tgstack/shared";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { ApiClient } from "./api";

interface AppContextValue {
  api: ApiClient;
  me: AppMeDto | undefined;
  locale: Locale;
  t: Translate;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Shares the API client, the signed-in user and the translator (user.locale, like the bot). */
export function AppProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const locale = me.data ? negotiateLocale(me.data.locale) : DEFAULT_LOCALE;
  const value = useMemo<AppContextValue>(
    () => ({ api, me: me.data, locale, t: createTranslator(locale, "miniapp") }),
    [api, me.data, locale],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}
