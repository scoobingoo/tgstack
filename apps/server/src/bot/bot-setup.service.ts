import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@tgstack/i18n";
import { InjectBot } from "@tgstack/nestjs-grammy";
import type { Bot } from "grammy";
import type { BotCommand } from "grammy/types";
import { AppConfig } from "../config/app-config.js";
import type { BotContext } from "./bot.context.js";
import { BotCommandsRegistry } from "./bot-commands.registry.js";
import { BotI18n } from "./bot-i18n.service.js";

/**
 * Publishes the command menu (per locale, plus an admin menu for
 * `ADMIN_TELEGRAM_IDS`) and the Mini App menu button on boot.
 */
@Injectable()
export class BotSetupService implements OnApplicationBootstrap {
  private readonly logger = new Logger("BotSetup");

  constructor(
    @InjectBot() private readonly bot: Bot<BotContext>,
    private readonly config: AppConfig,
    private readonly commands: BotCommandsRegistry,
    private readonly i18n: BotI18n,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.publishCommands();
      await this.publishMenuButton();
    } catch (error) {
      // Not fatal: the bot works without a command menu.
      this.logger.warn(
        `Bot setup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async publishCommands(): Promise<void> {
    for (const locale of SUPPORTED_LOCALES) {
      const languageCode = locale === DEFAULT_LOCALE ? {} : { language_code: locale };
      await this.bot.api.setMyCommands(this.describe(locale, false), languageCode);

      for (const adminId of this.config.env.ADMIN_TELEGRAM_IDS) {
        await this.bot.api.setMyCommands(this.describe(locale, true), {
          ...languageCode,
          scope: { type: "chat", chat_id: Number(adminId) },
        });
      }
    }
  }

  async publishMenuButton(): Promise<void> {
    const url = this.config.env.MINIAPP_URL;
    if (!url.startsWith("https://")) {
      this.logger.log(
        "MINIAPP_URL is not HTTPS; skipping the Mini App menu button (Telegram requires HTTPS).",
      );
      return;
    }
    await this.bot.api.setChatMenuButton({
      menu_button: { type: "web_app", text: "App", web_app: { url } },
    });
  }

  private describe(
    locale: (typeof SUPPORTED_LOCALES)[number],
    includeAdmin: boolean,
  ): BotCommand[] {
    return this.commands.list({ includeAdmin }).map(({ command, descriptionKey }) => ({
      command,
      description: this.i18n.t(locale, descriptionKey),
    }));
  }
}
