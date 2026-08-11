import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PARAM_ARGS_METADATA, UPDATE_METADATA } from "../src/grammy.constants.js";
import {
  CallbackQuery,
  Command,
  Ctx,
  GrammyParamType,
  getListenerMetadata,
  Hears,
  InlineQuery,
  Message,
  Next,
  On,
  Sender,
  Start,
  Update,
} from "../src/index.js";

@Update()
class Handlers {
  @Start()
  start() {}

  @Command(["help", "about"])
  help() {}

  @Hears(/hello/i)
  hears() {}

  @On("message:photo")
  photo() {}

  @CallbackQuery("pick:a")
  callback() {}

  @InlineQuery()
  anyInline() {}

  @InlineQuery(/^gif /)
  gifInline() {}

  @Command("first")
  @Command("second")
  @Hears("third")
  stacked() {}

  params(
    @Ctx() _ctx: unknown,
    @Next() _next: unknown,
    @Message("text") _text: unknown,
    @Sender() _from: unknown,
  ) {}
}

const proto = Handlers.prototype;

describe("@Update()", () => {
  it("marks the class", () => {
    expect(Reflect.getMetadata(UPDATE_METADATA, Handlers)).toBe(true);
  });
});

describe("listener decorators", () => {
  it.each([
    ["start", [{ type: "command", command: "start" }]],
    ["help", [{ type: "command", command: ["help", "about"] }]],
    ["hears", [{ type: "hears", trigger: /hello/i }]],
    ["photo", [{ type: "on", filter: "message:photo" }]],
    ["callback", [{ type: "callbackQuery", trigger: "pick:a" }]],
    ["anyInline", [{ type: "on", filter: "inline_query" }]],
    ["gifInline", [{ type: "inlineQuery", trigger: /^gif / }]],
  ] as const)("%s()", (method, expected) => {
    expect(getListenerMetadata(proto[method])).toEqual(expected);
  });

  it("keeps stacked decorators in top-to-bottom order", () => {
    expect(getListenerMetadata(proto.stacked)).toEqual([
      { type: "command", command: "first" },
      { type: "command", command: "second" },
      { type: "hears", trigger: "third" },
    ]);
  });

  it("returns an empty list for undecorated methods", () => {
    expect(getListenerMetadata(proto.params)).toEqual([]);
  });
});

describe("param decorators", () => {
  it("records type, index and data", () => {
    const metadata = Reflect.getMetadata(PARAM_ARGS_METADATA, Handlers, "params");
    expect(metadata).toEqual({
      [`${GrammyParamType.CONTEXT}:0`]: { index: 0, data: undefined, pipes: [] },
      [`${GrammyParamType.NEXT}:1`]: { index: 1, data: undefined, pipes: [] },
      [`${GrammyParamType.MESSAGE}:2`]: { index: 2, data: "text", pipes: [] },
      [`${GrammyParamType.SENDER}:3`]: { index: 3, data: undefined, pipes: [] },
    });
  });
});
