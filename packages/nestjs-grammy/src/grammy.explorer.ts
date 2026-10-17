import { Inject, Injectable, Logger } from "@nestjs/common";
import { DiscoveryService, ExternalContextCreator, MetadataScanner } from "@nestjs/core";
import type { Bot, Context, Middleware } from "grammy";
import { GrammyParamsFactory } from "./context/grammy-params.factory.js";
import { getListenerMetadata, type ListenerMetadata } from "./decorators/listeners.decorator.js";
import {
  GRAMMY_BOT,
  GRAMMY_CONTEXT_TYPE,
  GRAMMY_MODULE_OPTIONS,
  PARAM_ARGS_METADATA,
  UPDATE_METADATA,
} from "./grammy.constants.js";
import type { ResolvedGrammyModuleOptions } from "./grammy-options.js";

export interface RegisteredHandler {
  className: string;
  methodName: string;
  listener: ListenerMetadata;
}

type Triggers = string | RegExp | (string | RegExp)[];

/**
 * Finds every `@Update()` provider and registers its decorated methods on the bot.
 * Each handler runs through Nest's external context, so `@UseGuards()`,
 * `@UseInterceptors()`, `@UseFilters()` and parameter pipes work as usual.
 */
@Injectable()
export class GrammyExplorer {
  private readonly logger = new Logger("GrammyModule");
  private readonly paramsFactory = new GrammyParamsFactory();
  private registered: RegisteredHandler[] | undefined;

  constructor(
    @Inject(GRAMMY_MODULE_OPTIONS) private readonly options: ResolvedGrammyModuleOptions,
    @Inject(GRAMMY_BOT) private readonly bot: Bot<Context>,
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly externalContextCreator: ExternalContextCreator,
  ) {}

  /** Handlers registered so far, in registration order. */
  get handlers(): readonly RegisteredHandler[] {
    return this.registered ?? [];
  }

  /** Registers all handlers once. Called on application bootstrap. */
  explore(): readonly RegisteredHandler[] {
    if (this.registered) return this.registered;
    const registered: RegisteredHandler[] = [];
    this.registered = registered;

    const options = this.options.include ? { include: this.options.include } : {};
    for (const wrapper of this.discovery.getProviders(options)) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype || !Reflect.getMetadata(UPDATE_METADATA, metatype)) continue;
      if (!wrapper.isDependencyTreeStatic()) {
        this.logger.warn(
          `${String(wrapper.name)} is request-scoped or transient; @Update() classes must be singletons. Skipped.`,
        );
        continue;
      }

      const prototype = Object.getPrototypeOf(instance) as object;
      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const method = (prototype as Record<string, unknown>)[methodName];
        if (typeof method !== "function") continue;
        for (const listener of getListenerMetadata(method)) {
          this.register(
            instance as object,
            methodName,
            method as (...args: unknown[]) => unknown,
            listener,
          );
          registered.push({ className: metatype.name, methodName, listener });
        }
      }
    }

    this.logger.log(`Registered ${registered.length} bot handler(s)`);
    return registered;
  }

  private register(
    instance: object,
    methodName: string,
    method: (...args: unknown[]) => unknown,
    listener: ListenerMetadata,
  ): void {
    const handler = this.externalContextCreator.create(
      instance as never,
      method,
      methodName,
      PARAM_ARGS_METADATA,
      this.paramsFactory,
      undefined,
      undefined,
      undefined,
      GRAMMY_CONTEXT_TYPE,
    );

    const middleware: Middleware<Context> = async (ctx, next) => {
      const result: unknown = await handler(ctx, next);
      // Convenience: a handler that returns a string replies with it.
      if (typeof result === "string" && result.length > 0) {
        await ctx.reply(result);
      }
    };

    switch (listener.type) {
      case "command":
        this.bot.command(listener.command as string | string[], middleware);
        break;
      case "hears":
        this.bot.hears(listener.trigger as Triggers, middleware);
        break;
      case "on":
        this.bot.on(listener.filter as Parameters<Bot["on"]>[0], middleware);
        break;
      case "callbackQuery":
        this.bot.callbackQuery(listener.trigger as Triggers, middleware);
        break;
      case "inlineQuery":
        this.bot.inlineQuery(listener.trigger as Triggers, middleware);
        break;
    }
  }
}
