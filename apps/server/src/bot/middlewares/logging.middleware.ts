import { performance } from "node:perf_hooks";
import type { Logger } from "@nestjs/common";
import type { MiddlewareFn } from "grammy";
import type { BotContext } from "../bot.context.js";

/** One structured log line per update: type, sender, chat, outcome and latency. */
export function loggingMiddleware(logger: Logger): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const startedAt = performance.now();
    let outcome = "ok";
    try {
      await next();
    } catch (error) {
      outcome = "error";
      throw error;
    } finally {
      logger.log({
        msg: "update",
        updateId: ctx.update.update_id,
        updateType: Object.keys(ctx.update).find((key) => key !== "update_id"),
        userId: ctx.from?.id,
        chatId: ctx.chatId,
        outcome,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      });
    }
  };
}
