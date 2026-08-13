import { type DynamicModule, Logger, Module, type Provider } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { Bot, BotError, type Context } from "grammy";
import { GRAMMY_BOT, GRAMMY_MODULE_OPTIONS } from "./grammy.constants.js";
import { type ResolvedGrammyModuleOptions, resolveGrammyOptions } from "./grammy-options.js";
import type {
  GrammyModuleAsyncOptions,
  GrammyModuleOptions,
  GrammyOptionsFactory,
} from "./interfaces/grammy-options.interface.js";
import { GrammyExplorer } from "./services/grammy-explorer.service.js";
import { GrammyLifecycle } from "./services/grammy-lifecycle.service.js";

const RAW_OPTIONS = Symbol("GRAMMY_RAW_OPTIONS");

/**
 * Creates the `Bot`, installs transformers, an error boundary and global middleware
 * (in that order). Handlers from `@Update()` classes are added later, on bootstrap.
 */
export function createBot<C extends Context>(options: ResolvedGrammyModuleOptions<C>): Bot<C> {
  const bot = new Bot<C>(options.token, options.botConfig);
  for (const transformer of options.transformers ?? []) {
    bot.api.config.use(transformer);
  }

  const handleError = options.catch ?? defaultErrorHandler;
  bot.catch(handleError);
  // grammY only calls `bot.catch` while polling. This boundary applies the same
  // handler in webhook mode and to direct `handleUpdate()` calls, so a failing
  // handler never turns into an HTTP 500 that makes Telegram resend the update.
  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      await handleError(
        error instanceof BotError ? (error as BotError<C>) : new BotError(error, ctx),
      );
    }
  });

  for (const middleware of options.middlewares ?? []) {
    bot.use(middleware);
  }
  return bot;
}

const logger = new Logger("GrammyModule");

function defaultErrorHandler(err: BotError): void {
  logger.error(
    `Error while handling update ${err.ctx.update.update_id}: ${err.message}`,
    err.error instanceof Error ? err.error.stack : undefined,
  );
}

const coreProviders: Provider[] = [
  {
    provide: GRAMMY_BOT,
    useFactory: (options: ResolvedGrammyModuleOptions) => createBot(options),
    inject: [GRAMMY_MODULE_OPTIONS],
  },
  GrammyExplorer,
  GrammyLifecycle,
];

const coreExports = [GRAMMY_BOT, GRAMMY_MODULE_OPTIONS, GrammyExplorer, GrammyLifecycle];

/**
 * grammY integration for NestJS.
 *
 * ```ts
 * @Module({ imports: [GrammyModule.forRoot({ token: process.env.BOT_TOKEN! })] })
 * export class AppModule {}
 * ```
 *
 * The module is global: `@InjectBot()` works in every module once it is imported.
 */
@Module({})
export class GrammyModule {
  static forRoot<C extends Context = Context>(options: GrammyModuleOptions<C>): DynamicModule {
    return {
      module: GrammyModule,
      global: true,
      imports: [DiscoveryModule],
      providers: [
        { provide: GRAMMY_MODULE_OPTIONS, useValue: resolveGrammyOptions(options) },
        ...coreProviders,
      ],
      exports: coreExports,
    };
  }

  static forRootAsync<C extends Context = Context>(
    options: GrammyModuleAsyncOptions<C>,
  ): DynamicModule {
    return {
      module: GrammyModule,
      global: true,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers: [
        ...createAsyncOptionsProviders(options),
        {
          provide: GRAMMY_MODULE_OPTIONS,
          useFactory: (raw: GrammyModuleOptions<C>) => resolveGrammyOptions(raw),
          inject: [RAW_OPTIONS],
        },
        ...(options.extraProviders ?? []),
        ...coreProviders,
      ],
      exports: coreExports,
    };
  }
}

function createAsyncOptionsProviders<C extends Context>(
  options: GrammyModuleAsyncOptions<C>,
): Provider[] {
  if (options.useFactory) {
    return [{ provide: RAW_OPTIONS, useFactory: options.useFactory, inject: options.inject ?? [] }];
  }
  const factoryClass = options.useClass ?? options.useExisting;
  if (!factoryClass) {
    throw new Error(
      "GrammyModule.forRootAsync: provide `useFactory`, `useClass` or `useExisting`.",
    );
  }
  const raw: Provider = {
    provide: RAW_OPTIONS,
    useFactory: (factory: GrammyOptionsFactory<C>) => factory.createGrammyOptions(),
    inject: [factoryClass],
  };
  return options.useClass
    ? [raw, { provide: options.useClass, useClass: options.useClass }]
    : [raw];
}
