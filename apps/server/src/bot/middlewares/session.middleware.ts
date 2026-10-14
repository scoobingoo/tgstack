import { type MiddlewareFn, session } from "grammy";
import type { Redis } from "ioredis";
import type { BotContext, SessionData } from "../bot.context.js";
import { RedisStorage } from "./redis-storage.js";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** `ctx.session`, stored in Redis under `bot:session:<chat>` for 30 days. */
export function sessionMiddleware(redis: Redis): MiddlewareFn<BotContext> {
  return session<SessionData, BotContext>({
    initial: () => ({}),
    storage: new RedisStorage<SessionData>(redis, "bot:session:", SESSION_TTL_SECONDS),
  });
}
