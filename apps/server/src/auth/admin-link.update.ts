import { type OnModuleInit, UseGuards } from "@nestjs/common";
import { Command, Ctx, Update } from "@tgstack/nestjs-grammy";
import { InlineKeyboard } from "grammy";
import type { BotContext } from "../bot/bot.context.js";
import { BotCommandsRegistry } from "../bot/bot-commands.registry.js";
import { AuthService, MAGIC_LINK_TTL_SECONDS } from "./auth.service.js";
import { BotAdminGuard } from "./bot-admin.guard.js";

/** `/admin`: sends a one-time login link for the admin dashboard (admins only). */
@Update()
export class AdminLinkUpdate implements OnModuleInit {
  constructor(
    private readonly auth: AuthService,
    private readonly commands: BotCommandsRegistry,
  ) {}

  onModuleInit(): void {
    this.commands.register({ command: "admin", descriptionKey: "command-admin", adminOnly: true });
  }

  @Command("admin")
  @UseGuards(BotAdminGuard)
  async admin(@Ctx() ctx: BotContext): Promise<void> {
    const url = await this.auth.createMagicLink(ctx.user);
    const minutes = MAGIC_LINK_TTL_SECONDS / 60;
    // Telegram rejects URL buttons for http:// and localhost; the link is in the text anyway.
    const button =
      url.startsWith("https://") && !new URL(url).hostname.endsWith("localhost")
        ? { reply_markup: new InlineKeyboard().url(ctx.t("admin-link-button"), url) }
        : {};
    await ctx.reply(ctx.t("admin-link", { url, minutes }), {
      link_preview_options: { is_disabled: true },
      // `protect_content` stops the link from being forwarded or saved.
      protect_content: true,
      ...button,
    });
  }
}
