import type { RunOptions } from "@grammyjs/runner";
import type { FactoryProvider, ModuleMetadata, Provider, Type } from "@nestjs/common";
import type { BotConfig, Context, ErrorHandler, Middleware, Transformer } from "grammy";
import type { Update } from "grammy/types";

export type GrammyMode = "polling" | "webhook" | "none";

export type AllowedUpdate = Exclude<keyof Update, "update_id">;

export interface GrammyPollingOptions {
  /** Update types to receive. Omit to keep Telegram's default (everything except `chat_member`, …). */
  allowedUpdates?: readonly AllowedUpdate[];
  /** Drop updates that queued up while the bot was offline. Default: `false`. */
  dropPendingUpdates?: boolean;
  /** Extra options forwarded to `@grammyjs/runner`'s `run()`. */
  runner?: RunOptions<Update>;
}

export interface GrammyWebhookOptions {
  /** HTTP path the update handler is mounted on. Default: `/telegram/webhook`. */
  path?: string;
  /**
   * Value Telegram must send in the `X-Telegram-Bot-Api-Secret-Token` header.
   * Requests without it are rejected with `401`. Strongly recommended.
   */
  secretToken?: string;
  /** Full public URL of the webhook endpoint. Required when `setWebhook` is `true`. */
  url?: string;
  /** Call `setWebhook` on bootstrap. Default: `false`. */
  setWebhook?: boolean;
  allowedUpdates?: readonly AllowedUpdate[];
  dropPendingUpdates?: boolean;
  /**
   * Mount the handler on the Nest HTTP adapter automatically. Default: `true`.
   * Set to `false` and use `GrammyBotLifecycle#createWebhookCallback()` to mount it yourself.
   */
  autoMount?: boolean;
  /** How long grammY waits for middleware before answering Telegram. Default: 10 000 ms. */
  timeoutMilliseconds?: number;
}

export interface GrammyModuleOptions<C extends Context = Context> {
  /** Bot token from @BotFather. */
  token: string;
  /**
   * - `polling` (default): long polling through `@grammyjs/runner`.
   * - `webhook`: updates are POSTed to an HTTP route on the Nest app.
   * - `none`: the bot only sends requests (e.g. a queue worker) and receives no updates.
   */
  mode?: GrammyMode;
  /** Options forwarded to the grammY `Bot` constructor (`botInfo`, `client`, `ContextConstructor`). */
  botConfig?: BotConfig<C>;
  /** Global middleware and plugins, installed with `bot.use()` in this order before any handler. */
  middlewares?: ReadonlyArray<Middleware<C>>;
  /**
   * Bot API transformers (e.g. `autoRetry()`), installed with `bot.api.config.use()`
   * in array order. As in grammY, the last one installed wraps the others and runs first.
   */
  transformers?: ReadonlyArray<Transformer>;
  /**
   * Handles errors thrown by middleware and handlers, in every mode (grammY's own
   * `bot.catch` only covers polling). Defaults to logging through the Nest logger.
   */
  catch?: ErrorHandler<C>;
  polling?: GrammyPollingOptions;
  webhook?: GrammyWebhookOptions;
  /** Restrict handler discovery to these modules. Default: every module of the application. */
  // biome-ignore lint/complexity/noBannedTypes: same type as Nest's DiscoveryService `include`.
  include?: Function[];
}

export interface GrammyOptionsFactory<C extends Context = Context> {
  createGrammyOptions(): Promise<GrammyModuleOptions<C>> | GrammyModuleOptions<C>;
}

export interface GrammyModuleAsyncOptions<C extends Context = Context>
  extends Pick<ModuleMetadata, "imports"> {
  // biome-ignore lint/suspicious/noExplicitAny: same signature as Nest's FactoryProvider.
  useFactory?: (...args: any[]) => Promise<GrammyModuleOptions<C>> | GrammyModuleOptions<C>;
  inject?: FactoryProvider["inject"];
  useClass?: Type<GrammyOptionsFactory<C>>;
  useExisting?: Type<GrammyOptionsFactory<C>>;
  /** Additional providers made available to `useFactory`/`useClass`. */
  extraProviders?: Provider[];
}
