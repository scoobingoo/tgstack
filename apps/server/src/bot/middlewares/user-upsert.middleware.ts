import type { MiddlewareFn } from "grammy";
import type { UsersService } from "../../modules/users/users.service.js";
import type { BotContext } from "../bot.context.js";

/**
 * Creates or refreshes the `User` row of the sender (`lastSeenAt`, profile,
 * `isBlocked`) and exposes it as `ctx.user`. Updates without a human sender
 * (channel posts, other bots) stop here.
 */
export function userUpsertMiddleware(users: UsersService): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return;

    // A private-chat `my_chat_member` update tells us whether the user blocked the bot.
    const member = ctx.myChatMember?.chat.type === "private" ? ctx.myChatMember : undefined;
    ctx.user = await users.upsertFromTelegram(
      {
        id: from.id,
        firstName: from.first_name,
        lastName: from.last_name,
        username: from.username,
        languageCode: from.language_code,
      },
      // Any update from the user means they have not blocked the bot (any more).
      { isBlocked: member?.new_chat_member.status === "kicked" },
    );

    if (member) return; // nothing to answer to a block/unblock
    await next();
  };
}
