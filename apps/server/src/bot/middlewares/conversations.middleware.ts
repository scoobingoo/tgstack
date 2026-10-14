import { type ConversationData, conversations, type VersionedState } from "@grammyjs/conversations";
import type { MiddlewareFn } from "grammy";
import type { Redis } from "ioredis";
import type { BotContext, ConversationContext } from "../bot.context.js";
import { RedisStorage } from "./redis-storage.js";

const CONVERSATION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * The conversations plugin with its state in Redis (`bot:conversation:<chat>`),
 * so a wizard survives restarts and works across instances.
 */
export function conversationsMiddleware(redis: Redis): MiddlewareFn<BotContext> {
  return conversations<BotContext, ConversationContext>({
    storage: {
      type: "key",
      prefix: "bot:conversation:",
      adapter: new RedisStorage<VersionedState<ConversationData>>(
        redis,
        "",
        CONVERSATION_TTL_SECONDS,
      ),
    },
  });
}
