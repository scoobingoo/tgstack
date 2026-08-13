import type { ParamsFactory } from "@nestjs/core";
import type { Context, NextFunction } from "grammy";
import { GrammyParamType } from "../decorators/params.decorator.js";

type HandlerArgs = [Context, NextFunction];

export class GrammyParamsFactory implements ParamsFactory {
  exchangeKeyForValue(type: number, data: unknown, args: HandlerArgs): unknown {
    const [ctx, next] = args;
    const property = typeof data === "string" ? data : undefined;
    switch (type as GrammyParamType) {
      case GrammyParamType.CONTEXT:
        return ctx;
      case GrammyParamType.NEXT:
        return next;
      case GrammyParamType.MESSAGE:
        return pick(ctx.msg, property);
      case GrammyParamType.SENDER:
        return pick(ctx.from, property);
      default:
        return undefined;
    }
  }
}

function pick(source: object | undefined, property: string | undefined): unknown {
  if (source === undefined || property === undefined) return source;
  return (source as Record<string, unknown>)[property];
}
