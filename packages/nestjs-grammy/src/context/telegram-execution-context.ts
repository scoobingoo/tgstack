import type { ArgumentsHost, ExecutionContext, Type } from "@nestjs/common";
import type { Context, NextFunction } from "grammy";
import { GRAMMY_CONTEXT_TYPE } from "../grammy.constants.js";

/**
 * Typed view over a Nest `ArgumentsHost`/`ExecutionContext` for bot handlers.
 * Use it in guards, interceptors and exception filters:
 *
 * ```ts
 * const ctx = TelegramExecutionContext.create(host).getContext<MyContext>();
 * ```
 */
export class TelegramExecutionContext {
  private constructor(private readonly host: ArgumentsHost) {}

  static create(host: ArgumentsHost | ExecutionContext): TelegramExecutionContext {
    return new TelegramExecutionContext(host);
  }

  /** `true` when the host wraps a grammY handler (and not, say, an HTTP request). */
  static isTelegram(host: ArgumentsHost): boolean {
    return host.getType<string>() === GRAMMY_CONTEXT_TYPE;
  }

  getType(): string {
    return this.host.getType<string>();
  }

  getContext<C extends Context = Context>(): C {
    return this.host.getArgByIndex<C>(0);
  }

  getNext(): NextFunction {
    return this.host.getArgByIndex<NextFunction>(1);
  }

  /** The `@Update()` class of the handler (only available on an `ExecutionContext`). */
  getClass<T = unknown>(): Type<T> | undefined {
    return "getClass" in this.host ? (this.host as ExecutionContext).getClass<T>() : undefined;
  }

  /** The handler method (only available on an `ExecutionContext`). */
  // biome-ignore lint/complexity/noBannedTypes: mirrors Nest's ExecutionContext#getHandler().
  getHandler(): Function | undefined {
    return "getHandler" in this.host ? (this.host as ExecutionContext).getHandler() : undefined;
  }
}
