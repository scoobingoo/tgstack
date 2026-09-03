import { Command, Ctx, Start, Update } from "@tgstack/nestjs-grammy";
import { escapeHtml } from "@tgstack/shared";
import { InlineKeyboard } from "grammy";
import { AppConfig } from "../../config/app-config.js";
import type { BotContext } from "../bot.context.js";

@Update()
export class StartUpdate {
  constructor(private readonly config: AppConfig) {}

  @Start()
  async start(@Ctx() ctx: BotContext): Promise<void> {
    ctx.session.startCount = (ctx.session.startCount ?? 0) + 1;

    const miniAppUrl = this.config.env.MINIAPP_URL;
    // Telegram only accepts HTTPS Web App URLs; in local dev the button is skipped.
    const keyboard = miniAppUrl.startsWith("https://")
      ? new InlineKeyboard().webApp(ctx.t("welcome-open-app"), miniAppUrl)
      : undefined;

    await ctx.reply(ctx.t("welcome", { name: escapeHtml(ctx.user.firstName) }), {
      parse_mode: "HTML",
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
  }

  @Command("help")
  async help(@Ctx() ctx: BotContext): Promise<void> {
    await ctx.reply(ctx.t("help"), { parse_mode: "HTML" });
  }
}
