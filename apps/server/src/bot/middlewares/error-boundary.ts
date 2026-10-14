import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { negotiateLocale } from "@tgstack/i18n";
import type { BotError } from "grammy";
import type { BotContext } from "../bot.context.js";
import { BotI18n } from "./i18n.middleware.js";

/**
 * Last line of defence for bot updates: logs the error and tells the user that
 * something went wrong, so they are never left without an answer.
 */
@Injectable()
export class BotErrorHandler {
  private readonly logger = new Logger("Bot");

  constructor(private readonly i18n: BotI18n) {}

  /** grammY `catch` handler (installed through nestjs-grammy's error boundary). */
  readonly handle = async (error: BotError<BotContext>): Promise<void> => {
    const { ctx } = error;
    const cause = error.error;
    this.logger.error(
      {
        msg: "update failed",
        updateId: ctx.update.update_id,
        userId: ctx.from?.id,
        error: cause instanceof Error ? cause.message : String(cause),
      },
      cause instanceof Error ? cause.stack : undefined,
    );
    await this.reply(
      ctx,
      cause instanceof ForbiddenException ? "error-forbidden" : "error-generic",
    );
  };

  /** Best-effort localized reply; never throws. */
  async reply(ctx: BotContext, key: "error-forbidden" | "error-generic"): Promise<void> {
    const text =
      typeof ctx.t === "function"
        ? ctx.t(key)
        : this.i18n.t(negotiateLocale(ctx.user?.locale, ctx.from?.language_code), key);
    try {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text, show_alert: true });
      } else if (ctx.chatId !== undefined) {
        await ctx.reply(text);
      }
    } catch (replyError) {
      this.logger.warn(`Could not send the error message: ${String(replyError)}`);
    }
  }
}
