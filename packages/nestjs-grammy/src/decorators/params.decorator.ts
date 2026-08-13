import type { PipeTransform, Type } from "@nestjs/common";
import { PARAM_ARGS_METADATA } from "../grammy.constants.js";

export enum GrammyParamType {
  CONTEXT = 0,
  NEXT = 1,
  MESSAGE = 2,
  SENDER = 3,
}

export interface GrammyParamMetadata {
  index: number;
  data?: string;
  pipes: (Type<PipeTransform> | PipeTransform)[];
}

type ParamPipe = Type<PipeTransform> | PipeTransform;

function createParamDecorator(type: GrammyParamType) {
  return (data?: string, ...pipes: ParamPipe[]): ParameterDecorator =>
    (target, key, index) => {
      if (key === undefined) {
        throw new TypeError("grammY parameter decorators can only be used on handler methods.");
      }
      const existing =
        (Reflect.getMetadata(PARAM_ARGS_METADATA, target.constructor, key) as
          | Record<string, GrammyParamMetadata>
          | undefined) ?? {};
      Reflect.defineMetadata(
        PARAM_ARGS_METADATA,
        { ...existing, [`${type}:${index}`]: { index, data, pipes } },
        target.constructor,
        key,
      );
    };
}

/** Injects the grammY `Context` of the current update. */
export const Ctx = (...pipes: ParamPipe[]): ParameterDecorator =>
  createParamDecorator(GrammyParamType.CONTEXT)(undefined, ...pipes);

/** Injects grammY's `next()` function, to pass the update on to later middleware. */
export const Next = (): ParameterDecorator => createParamDecorator(GrammyParamType.NEXT)();

/**
 * Injects `ctx.msg` (message, edited message, channel post, …), or one of its
 * properties: `@Message("text") text: string`.
 */
export const Message = (property?: string, ...pipes: ParamPipe[]): ParameterDecorator =>
  createParamDecorator(GrammyParamType.MESSAGE)(property, ...pipes);

/** Injects `ctx.from` (the Telegram user behind the update), or one of its properties. */
export const Sender = (property?: string, ...pipes: ParamPipe[]): ParameterDecorator =>
  createParamDecorator(GrammyParamType.SENDER)(property, ...pipes);
