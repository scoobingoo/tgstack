import { isLocale, LOCALE_LABELS, SUPPORTED_LOCALES } from "@tgstack/i18n";
import { CallbackQuery, Command, Ctx, Update } from "@tgstack/nestjs-grammy";
import { InlineKeyboard } from "grammy";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import type { BotContext } from "../bot.context.js";

export const LANGUAGE_CALLBACK = /^lang:([a-z]{2})$/;

@Update()
export class LanguageUpdate {
  constructor(private readonly prisma: PrismaService) {}

  @Command("language")
  async choose(@Ctx() ctx: BotContext): Promise<void> {
    const keyboard = new InlineKeyboard();
    for (const locale of SUPPORTED_LOCALES) {
      const { flag, label } = LOCALE_LABELS[locale];
      const current = ctx.user.locale === locale ? " ✓" : "";
      keyboard.text(`${flag} ${label}${current}`, `lang:${locale}`);
    }
    await ctx.reply(ctx.t("language-choose"), { reply_markup: keyboard });
  }

  @CallbackQuery(LANGUAGE_CALLBACK)
  async select(@Ctx() ctx: BotContext & { match: RegExpMatchArray }): Promise<void> {
    const locale = ctx.match[1];
    if (!isLocale(locale)) {
      await ctx.answerCallbackQuery();
      return;
    }

    ctx.user = await this.prisma.user.update({ where: { id: ctx.user.id }, data: { locale } });
    // Persisted for future updates; switch the current one too.
    ctx.i18n.useLocale(locale);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(ctx.t("language-changed"));
  }
}
