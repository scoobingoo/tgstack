import { autoRetry } from "@grammyjs/auto-retry";
import { type DynamicModule, Module } from "@nestjs/common";
import { type AllowedUpdate, type GrammyMode, GrammyModule } from "@tgstack/nestjs-grammy";
import type { ApiClientOptions } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { AppConfig } from "../config/app-config.js";
import type { BotContext } from "./bot.context.js";
import { BotCommandsRegistry } from "./bot-commands.registry.js";
import { BotSetupService } from "./bot-setup.service.js";
import { BotMiddlewares } from "./middlewares/bot-middlewares.service.js";
import { BotErrorHandler } from "./middlewares/error-boundary.js";
import { BotI18n } from "./middlewares/i18n.middleware.js";
import { LanguageUpdate } from "./updates/language.update.js";
import { StartUpdate } from "./updates/start.update.js";

export const WEBHOOK_PATH = "/telegram/webhook";

/** Update types the bot subscribes to (polling and webhook). */
export const ALLOWED_UPDATES: readonly AllowedUpdate[] = [
  "message",
  "edited_message",
  "callback_query",
  "inline_query",
  "pre_checkout_query",
  "my_chat_member",
];

/** Safety net: in NODE_ENV=test without a mocked API, never reach api.telegram.org. */
const blockedFetch: typeof fetch = async (input) => {
  throw new Error(
    `Bot API request to ${String(input).replace(/bot[^/]+/, "bot<token>")} attempted in a test without a mocked Bot API.`,
  );
};

export interface BotModuleOptions {
  /** Overrides `BOT_MODE` (tests use `"none"` or `"webhook"`). */
  mode?: GrammyMode;
  /** HTTP client options — tests pass a mocked Bot API (`MockBotApi#clientOptions`). */
  client?: ApiClientOptions;
  /** Skips `getMe` (tests). */
  botInfo?: UserFromGetMe;
}

/** Services shared by the bot's middleware, handlers and feature modules. */
@Module({
  providers: [BotI18n, BotMiddlewares, BotErrorHandler, BotCommandsRegistry],
  exports: [BotI18n, BotMiddlewares, BotErrorHandler, BotCommandsRegistry],
})
export class BotCoreModule {}

@Module({})
export class BotModule {
  static forRoot(options: BotModuleOptions = {}): DynamicModule {
    return {
      module: BotModule,
      global: true,
      imports: [
        BotCoreModule,
        GrammyModule.forRootAsync<BotContext>({
          imports: [BotCoreModule],
          inject: [AppConfig, BotMiddlewares, BotErrorHandler],
          useFactory: (config: AppConfig, middlewares: BotMiddlewares, errors: BotErrorHandler) => {
            const { env } = config;
            return {
              token: env.BOT_TOKEN,
              mode: options.mode ?? env.BOT_MODE,
              botConfig: {
                ...(options.botInfo ? { botInfo: options.botInfo } : {}),
                // The client options also reach the Api instances conversations create.
                client: {
                  ...(options.client ?? (config.isTest ? { fetch: blockedFetch } : {})),
                  ...(env.BOT_TEST_ENVIRONMENT ? { environment: "test" as const } : {}),
                },
              },
              transformers: [autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 })],
              middlewares: middlewares.create(),
              catch: errors.handle,
              polling: { allowedUpdates: ALLOWED_UPDATES },
              webhook: {
                path: WEBHOOK_PATH,
                ...(env.BOT_WEBHOOK_SECRET ? { secretToken: env.BOT_WEBHOOK_SECRET } : {}),
                ...(env.BOT_WEBHOOK_URL
                  ? { url: `${env.BOT_WEBHOOK_URL.replace(/\/+$/, "")}${WEBHOOK_PATH}` }
                  : {}),
                setWebhook: env.BOT_AUTO_SET_WEBHOOK,
                allowedUpdates: ALLOWED_UPDATES,
              },
            };
          },
        }),
      ],
      providers: [StartUpdate, LanguageUpdate, BotSetupService],
      exports: [BotCoreModule],
    };
  }
}
