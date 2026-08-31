import { performance } from "node:perf_hooks";
import { type ConversationData, conversations, type VersionedState } from "@grammyjs/conversations";
import { sequentialize } from "@grammyjs/runner";
import { Injectable, Logger } from "@nestjs/common";
import { negotiateLocale } from "@tgstack/i18n";
import { Composer, type Middleware, type MiddlewareFn, session } from "grammy";
import { Redis } from "ioredis";
import { AppConfig } from "../config/app-config.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { InjectRedis } from "../redis/redis.module.js";
import type { BotContext, ConversationContext, SessionData } from "./bot.context.js";
import { BotI18n } from "./bot-i18n.service.js";
import { RedisStorage } from "./redis-storage.js";

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const CONVERSATION_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Builds the global middleware pipeline, in order (PLAN T2.3):
 * (error boundary, installed by nestjs-grammy) → per-chat ordering → logging →
 * user upsert → session (Redis) → i18n → conversations (Redis) → /cancel.
 * API calls are retried by the auto-retry transformer (see bot.module.ts).
 */
@Injectable()
export class BotMiddlewares {
  private readonly logger = new Logger("Bot");

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly i18n: BotI18n,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  create(): Middleware<BotContext>[] {
    return [
      // The runner processes updates concurrently; keep each chat's updates in order
      // so sessions and conversations never see interleaved writes.
      sequentialize<BotContext>((ctx) => ctx.chatId?.toString() ?? ctx.from?.id.toString()),
      this.logging(),
      this.upsertUser(),
      session<SessionData, BotContext>({
        initial: () => ({}),
        storage: new RedisStorage<SessionData>(this.redis, "bot:session:", SESSION_TTL_SECONDS),
      }),
      this.i18n.i18n,
      conversations<BotContext, ConversationContext>({
        storage: {
          type: "key",
          prefix: "bot:conversation:",
          adapter: new RedisStorage<VersionedState<ConversationData>>(
            this.redis,
            "",
            CONVERSATION_TTL_SECONDS,
          ),
        },
      }),
      this.cancel(),
    ];
  }

  /** Structured log line per update: type, sender, chat and latency. */
  logging(): MiddlewareFn<BotContext> {
    return async (ctx, next) => {
      const startedAt = performance.now();
      let outcome = "ok";
      try {
        await next();
      } catch (error) {
        outcome = "error";
        throw error;
      } finally {
        this.logger.log({
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

  /**
   * Creates or refreshes the `User` row of the sender and exposes it as `ctx.user`.
   * Updates without a human sender (channel posts, other bots) stop here.
   */
  upsertUser(): MiddlewareFn<BotContext> {
    const adminIds = new Set(this.config.env.ADMIN_TELEGRAM_IDS);
    return async (ctx, next) => {
      const from = ctx.from;
      if (!from || from.is_bot) return;

      const telegramId = BigInt(from.id);
      // A private-chat `my_chat_member` update tells us whether the user blocked the bot.
      const member = ctx.myChatMember?.chat.type === "private" ? ctx.myChatMember : undefined;
      const isBlocked = member?.new_chat_member.status === "kicked";
      const profile = {
        username: from.username ?? null,
        firstName: from.first_name,
        lastName: from.last_name ?? null,
        languageCode: from.language_code ?? null,
      };

      ctx.user = await this.prisma.user.upsert({
        where: { telegramId },
        create: {
          telegramId,
          ...profile,
          locale: negotiateLocale(from.language_code),
          role: adminIds.has(telegramId) ? "ADMIN" : "USER",
          isBlocked,
        },
        update: { ...profile, isBlocked, lastSeenAt: new Date() },
      });

      if (member) return; // nothing to answer to a block/unblock
      await next();
    };
  }

  /**
   * `/cancel` must run before conversations resume, otherwise the active
   * conversation would swallow it as its next answer.
   */
  cancel(): Middleware<BotContext> {
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
}
