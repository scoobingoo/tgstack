import { I18n } from "@grammyjs/i18n";
import { Injectable } from "@nestjs/common";
import {
  DEFAULT_LOCALE,
  getSource,
  type Locale,
  negotiateLocale,
  SUPPORTED_LOCALES,
} from "@tgstack/i18n";
import type { BotContext } from "./bot.context.js";

/**
 * The bot's i18n plugin, fed from `@tgstack/i18n` (`locales/<locale>/bot.ftl`).
 * Locale negotiation (decision in PLAN T2.4): `user.locale` → Telegram
 * `language_code` → English.
 */
@Injectable()
export class BotI18n {
  readonly i18n = new I18n<BotContext>({
    defaultLocale: DEFAULT_LOCALE,
    useSession: false,
    // No invisible Unicode isolation marks around variables (they break links and commands).
    fluentBundleOptions: { useIsolating: false },
    localeNegotiator: (ctx) => negotiateLocale(ctx.user?.locale, ctx.from?.language_code),
  });

  constructor() {
    for (const locale of SUPPORTED_LOCALES) {
      this.i18n.loadLocaleSync(locale, { source: getSource(locale, "bot") });
    }
  }

  /** Translates outside of an update, e.g. for `setMyCommands` or queued messages. */
  t(locale: Locale, key: string, variables?: Record<string, string | number>): string {
    return this.i18n.t(locale, key, variables);
  }
}
