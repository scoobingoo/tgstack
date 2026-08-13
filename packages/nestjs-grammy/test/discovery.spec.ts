import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Bot, Context, NextFunction } from "grammy";
import type { User } from "grammy/types";
import { afterEach, describe, expect, it } from "vitest";
import {
  CallbackQuery,
  Command,
  Ctx,
  GRAMMY_BOT,
  GrammyExplorer,
  GrammyModule,
  Hears,
  InlineQuery,
  Message,
  Next,
  On,
  Sender,
  Start,
  Update,
} from "../src/index.js";
import {
  createCallbackQueryUpdate,
  createCommandUpdate,
  createInlineQueryUpdate,
  createPhotoUpdate,
  createTextUpdate,
  MockBotApi,
  testUser,
} from "../src/testing/index.js";

const seen: string[] = [];

@Injectable()
class GreetingService {
  greet(name: string) {
    return `Hello, ${name}!`;
  }
}

@Update()
class CommandsUpdate {
  constructor(private readonly greetings: GreetingService) {}

  @Start()
  async start(@Ctx() ctx: Context, @Sender("first_name") firstName: string) {
    seen.push("start");
    await ctx.reply(this.greetings.greet(firstName));
  }

  @Command(["help", "about"])
  help() {
    seen.push("help");
    return "Help text";
  }

  @Hears(/^ping$/i)
  ping(@Message("text") text: string) {
    seen.push(`hears:${text}`);
    return "pong";
  }
}

@Update()
class EventsUpdate {
  @On("message:photo")
  photo(@Message() message: { caption?: string }, @Sender() from: User) {
    seen.push(`photo:${message.caption}:${from.id}`);
  }

  @CallbackQuery(/^pick:(.+)$/)
  async pick(@Ctx() ctx: Context & { match: RegExpMatchArray }) {
    seen.push(`callback:${ctx.match[1]}`);
    await ctx.answerCallbackQuery();
  }

  @InlineQuery(/^gif (.+)/)
  gif() {
    seen.push("inline:gif");
  }

  @InlineQuery()
  anyInline() {
    seen.push("inline:any");
  }

  @On("message:text")
  async fallback(@Ctx() ctx: Context, @Next() next: NextFunction) {
    seen.push(`fallback:${ctx.msg?.text}`);
    await next();
  }
}

@Update()
class SecondCommandsUpdate {
  @Command("help")
  neverReached() {
    seen.push("second-help");
  }
}

@Module({ providers: [GreetingService, CommandsUpdate, EventsUpdate, SecondCommandsUpdate] })
class FeatureModule {}

async function createApp() {
  const api = new MockBotApi();
  const moduleRef = await Test.createTestingModule({
    imports: [
      GrammyModule.forRoot({
        token: "1:TEST",
        mode: "none",
        botConfig: { botInfo: api.botInfo },
        transformers: [api.transformer],
      }),
      FeatureModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, api, bot: app.get<Bot>(GRAMMY_BOT), explorer: app.get(GrammyExplorer) };
}

afterEach(() => {
  seen.length = 0;
});

describe("handler discovery", () => {
  it("registers handlers of every @Update class in a deterministic order", async () => {
    const first = await createApp();
    const second = await createApp();
    const describeHandlers = (explorer: GrammyExplorer) =>
      explorer.handlers.map((h) => `${h.className}.${h.methodName}`);

    expect(describeHandlers(first.explorer)).toEqual([
      "CommandsUpdate.start",
      "CommandsUpdate.help",
      "CommandsUpdate.ping",
      "EventsUpdate.photo",
      "EventsUpdate.pick",
      "EventsUpdate.gif",
      "EventsUpdate.anyInline",
      "EventsUpdate.fallback",
      "SecondCommandsUpdate.neverReached",
    ]);
    expect(describeHandlers(second.explorer)).toEqual(describeHandlers(first.explorer));
    await first.app.close();
    await second.app.close();
  });

  it("routes each update type to its handler with injected params", async () => {
    const { app, api, bot } = await createApp();

    await bot.handleUpdate(createCommandUpdate("start"));
    await bot.handleUpdate(createCommandUpdate("about"));
    await bot.handleUpdate(createTextUpdate("PING"));
    await bot.handleUpdate(createPhotoUpdate("cat"));
    await bot.handleUpdate(createCallbackQueryUpdate("pick:b"));
    await bot.handleUpdate(createInlineQueryUpdate("gif cats"));
    await bot.handleUpdate(createInlineQueryUpdate("anything"));
    await bot.handleUpdate(createTextUpdate("just text"));

    expect(seen).toEqual([
      "start",
      "help",
      "hears:PING",
      `photo:cat:${testUser.id}`,
      "callback:b",
      "inline:gif",
      "inline:any",
      "fallback:just text",
    ]);
    expect(api.callsTo("sendMessage").map((c) => c.payload.text)).toEqual([
      "Hello, Ada!",
      "Help text",
      "pong",
    ]);
    expect(api.callsTo("answerCallbackQuery")).toHaveLength(1);
    await app.close();
  });

  it("stops at the first matching handler", async () => {
    const { app, bot } = await createApp();
    await bot.handleUpdate(createCommandUpdate("help"));
    expect(seen).toEqual(["help"]);
    await app.close();
  });

  it("limits discovery to `include`d modules", async () => {
    const api = new MockBotApi();
    const moduleRef = await Test.createTestingModule({
      imports: [
        GrammyModule.forRoot({
          token: "1:TEST",
          mode: "none",
          botConfig: { botInfo: api.botInfo },
          transformers: [api.transformer],
          include: [],
        }),
        FeatureModule,
      ],
    }).compile();
    const app = await moduleRef.createNestApplication().init();
    expect(app.get(GrammyExplorer).handlers).toHaveLength(0);
    await app.close();
  });
});
