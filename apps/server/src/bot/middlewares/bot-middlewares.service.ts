import { sequentialize } from "@grammyjs/runner";
import { Injectable, Logger } from "@nestjs/common";
import { Composer, type Middleware } from "grammy";
import { Redis } from "ioredis";
import { InjectRedis } from "../../infra/redis/redis.module.js";
import { UsersService } from "../../modules/users/users.service.js";
import type { BotContext } from "../bot.context.js";
import { cancelMiddleware } from "./cancel.middleware.js";
import { conversationsMiddleware } from "./conversations.middleware.js";
import { BotI18n } from "./i18n.middleware.js";
import { loggingMiddleware } from "./logging.middleware.js";
import { sessionMiddleware } from "./session.middleware.js";
import { userUpsertMiddleware } from "./user-upsert.middleware.js";

/**
 * Assembles the global middleware pipeline. The order matters (docs/architecture.md):
 *
 * 0. error boundary — installed by nestjs-grammy around everything (`error-boundary.ts`)
 * 1. per-chat ordering — `sequentialize`, the runner processes updates concurrently
 * 2. logging
 * 3. user upsert → `ctx.user`
 * 4. session (Redis) → `ctx.session`
 * 5. i18n → `ctx.t`
 * 6. {@link beforeConversations} — handlers that must not be swallowed by a wizard
 * 7. conversations (Redis)
 * 8. `/cancel`
 *
 * then the `@Update()` handlers. API calls are retried by the auto-retry transformer.
 */
@Injectable()
export class BotMiddlewares {
  private readonly logger = new Logger("Bot");

  /**
   * Handlers that must see their updates even while a conversation is active
   * (an active conversation consumes every update of its chat), e.g. payments.
   * Feature modules add to it in `onModuleInit`.
   */
  readonly beforeConversations = new Composer<BotContext>();

  constructor(
    private readonly users: UsersService,
    private readonly i18n: BotI18n,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  create(): Middleware<BotContext>[] {
    return [
      // Keep each chat's updates in order so sessions and conversations never see
      // interleaved writes.
      sequentialize<BotContext>((ctx) => ctx.chatId?.toString() ?? ctx.from?.id.toString()),
      loggingMiddleware(this.logger),
      userUpsertMiddleware(this.users),
      sessionMiddleware(this.redis),
      this.i18n.middleware(),
      this.beforeConversations,
      conversationsMiddleware(this.redis),
      cancelMiddleware(),
    ];
  }
}
