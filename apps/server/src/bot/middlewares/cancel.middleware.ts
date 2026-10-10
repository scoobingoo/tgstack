import { Composer, type Middleware } from "grammy";
import type { BotContext } from "../bot.context.js";

/**
 * `/cancel` leaves any active conversation. It is middleware, not an `@Update`
 * handler, because it must run before conversations resume — otherwise the
 * active conversation would swallow it as its next answer.
 */
export function cancelMiddleware(): Middleware<BotContext> {
  const composer = new Composer<BotContext>();
  composer.command("cancel", async (ctx) => {
    const active = Object.keys(await ctx.conversation.active()).length > 0;
    if (active) await ctx.conversation.exitAll();
    await ctx.reply(ctx.t(active ? "cancel-done" : "cancel-nothing"), {
      reply_markup: { remove_keyboard: true },
    });
  });
  return composer;
}
