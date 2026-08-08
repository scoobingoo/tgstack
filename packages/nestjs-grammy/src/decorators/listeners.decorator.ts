import type { FilterQuery } from "grammy";
import { LISTENERS_METADATA } from "../grammy.constants.js";

type MaybeArray<T> = T | readonly T[];
export type Trigger = MaybeArray<string | RegExp>;

export type ListenerMetadata =
  | { type: "command"; command: MaybeArray<string> }
  | { type: "hears"; trigger: Trigger }
  | { type: "on"; filter: MaybeArray<FilterQuery> }
  | { type: "callbackQuery"; trigger: Trigger }
  | { type: "inlineQuery"; trigger: Trigger };

export function getListenerMetadata(handler: object): ListenerMetadata[] {
  return (Reflect.getMetadata(LISTENERS_METADATA, handler) as ListenerMetadata[] | undefined) ?? [];
}

function createListenerDecorator(listener: ListenerMetadata): MethodDecorator {
  return (_target, _key, descriptor) => {
    const handler = descriptor.value as object;
    // Decorators run bottom-up; prepend so the top-most decorator registers first.
    Reflect.defineMetadata(
      LISTENERS_METADATA,
      [listener, ...getListenerMetadata(handler)],
      handler,
    );
    return descriptor;
  };
}

/** Handles the `/start` command (`bot.command("start")`). */
export const Start = (): MethodDecorator =>
  createListenerDecorator({ type: "command", command: "start" });

/** Handles one or more commands, without the leading slash (`bot.command()`). */
export const Command = (command: MaybeArray<string>): MethodDecorator =>
  createListenerDecorator({ type: "command", command });

/** Handles messages whose text or caption matches the trigger (`bot.hears()`). */
export const Hears = (trigger: Trigger): MethodDecorator =>
  createListenerDecorator({ type: "hears", trigger });

/** Handles updates matching a grammY filter query such as `"message:photo"` (`bot.on()`). */
export const On = (filter: MaybeArray<FilterQuery>): MethodDecorator =>
  createListenerDecorator({ type: "on", filter });

/** Handles callback queries whose data matches the trigger (`bot.callbackQuery()`). */
export const CallbackQuery = (trigger: Trigger): MethodDecorator =>
  createListenerDecorator({ type: "callbackQuery", trigger });

/**
 * Handles inline queries. Without a trigger it receives every inline query
 * (`bot.on("inline_query")`), otherwise only matching ones (`bot.inlineQuery()`).
 */
export const InlineQuery = (trigger?: Trigger): MethodDecorator =>
  trigger === undefined
    ? createListenerDecorator({ type: "on", filter: "inline_query" })
    : createListenerDecorator({ type: "inlineQuery", trigger });
