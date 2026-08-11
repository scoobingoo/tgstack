import "reflect-metadata";
import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Bot } from "grammy";
import { describe, expect, it } from "vitest";
import {
  GRAMMY_BOT,
  GRAMMY_MODULE_OPTIONS,
  GrammyModule,
  type GrammyModuleOptions,
  type GrammyOptionsFactory,
  type ResolvedGrammyModuleOptions,
  resolveGrammyOptions,
} from "../src/index.js";
import { createBotInfo } from "../src/testing/index.js";

const TOKEN = "123456:TEST-TOKEN";

describe("resolveGrammyOptions", () => {
  it("applies defaults", () => {
    const resolved = resolveGrammyOptions({ token: TOKEN });
    expect(resolved.mode).toBe("polling");
    expect(resolved.webhook).toEqual({
      path: "/telegram/webhook",
      autoMount: true,
      setWebhook: false,
    });
  });

  it("keeps explicit values and normalises the webhook path", () => {
    const resolved = resolveGrammyOptions({
      token: TOKEN,
      mode: "webhook",
      webhook: { path: "hooks/tg", secretToken: "s3cr3t_-", autoMount: false },
    });
    expect(resolved.mode).toBe("webhook");
    expect(resolved.webhook.path).toBe("/hooks/tg");
    expect(resolved.webhook.secretToken).toBe("s3cr3t_-");
    expect(resolved.webhook.autoMount).toBe(false);
  });

  it.each([
    [{ token: "" }, /token/],
    [{ token: "   " }, /token/],
    [{ token: TOKEN, mode: "smoke-signals" }, /unknown mode/],
    [{ token: TOKEN, mode: "webhook", webhook: { setWebhook: true } }, /webhook\.url/],
    [{ token: TOKEN, webhook: { secretToken: "has spaces" } }, /secretToken/],
    [{ token: TOKEN, webhook: { secretToken: "x".repeat(257) } }, /secretToken/],
  ])("rejects invalid options %#", (options, message) => {
    expect(() => resolveGrammyOptions(options as GrammyModuleOptions)).toThrow(message);
  });
});

describe("GrammyModule option resolution", () => {
  const botConfig = { botInfo: createBotInfo() };

  async function resolve(module: ReturnType<typeof GrammyModule.forRoot>) {
    const moduleRef = await Test.createTestingModule({ imports: [module] }).compile();
    return {
      options: moduleRef.get<ResolvedGrammyModuleOptions>(GRAMMY_MODULE_OPTIONS),
      bot: moduleRef.get<Bot>(GRAMMY_BOT),
    };
  }

  it("forRoot provides the resolved options and a Bot", async () => {
    const { options, bot } = await resolve(
      GrammyModule.forRoot({ token: TOKEN, mode: "none", botConfig }),
    );
    expect(options.mode).toBe("none");
    expect(bot).toBeInstanceOf(Bot);
    expect(bot.token).toBe(TOKEN);
    expect(bot.botInfo.username).toBe("test_bot");
  });

  it("forRootAsync supports useFactory with inject", async () => {
    @Injectable()
    class TokenSource {
      readonly token = TOKEN;
    }
    @Module({ providers: [TokenSource], exports: [TokenSource] })
    class TokenModule {}

    const { options, bot } = await resolve(
      GrammyModule.forRootAsync({
        imports: [TokenModule],
        inject: [TokenSource],
        useFactory: async (source: TokenSource) => ({
          token: source.token,
          mode: "none",
          botConfig,
        }),
      }),
    );
    expect(options.token).toBe(TOKEN);
    expect(bot.token).toBe(TOKEN);
  });

  it("forRootAsync supports useClass", async () => {
    @Injectable()
    class OptionsFactory implements GrammyOptionsFactory {
      createGrammyOptions(): GrammyModuleOptions {
        return { token: TOKEN, mode: "webhook", webhook: { autoMount: false }, botConfig };
      }
    }
    const { options } = await resolve(GrammyModule.forRootAsync({ useClass: OptionsFactory }));
    expect(options.mode).toBe("webhook");
    expect(options.webhook.path).toBe("/telegram/webhook");
  });

  it("forRootAsync supports useExisting", async () => {
    @Injectable()
    class ExistingFactory implements GrammyOptionsFactory {
      createGrammyOptions(): GrammyModuleOptions {
        return { token: TOKEN, mode: "none", botConfig };
      }
    }
    @Module({ providers: [ExistingFactory], exports: [ExistingFactory] })
    class FactoryModule {}

    const { options } = await resolve(
      GrammyModule.forRootAsync({ imports: [FactoryModule], useExisting: ExistingFactory }),
    );
    expect(options.mode).toBe("none");
  });

  it("forRootAsync validates the options the factory returns", async () => {
    await expect(
      resolve(GrammyModule.forRootAsync({ useFactory: () => ({ token: "" }) })),
    ).rejects.toThrow(/token/);
  });

  it("forRootAsync requires a factory", () => {
    expect(() => GrammyModule.forRootAsync({})).toThrow(/useFactory/);
  });

  it("installs transformers and middleware in order", async () => {
    const order: string[] = [];
    const { bot } = await resolve(
      GrammyModule.forRoot({
        token: TOKEN,
        mode: "none",
        botConfig,
        // Like grammY: the last transformer installed is the outermost one.
        transformers: [
          () => Promise.resolve({ ok: true, result: true } as never),
          (prev, method, payload, signal) => {
            order.push(`transformer:${method}`);
            return prev(method, payload, signal);
          },
        ],
        middlewares: [
          async (_ctx, next) => {
            order.push("mw1");
            await next();
          },
          async (_ctx, next) => {
            order.push("mw2");
            await next();
          },
        ],
      }),
    );
    await bot.handleUpdate({ update_id: 1 });
    await bot.api.deleteWebhook();
    expect(order).toEqual(["mw1", "mw2", "transformer:deleteWebhook"]);
  });
});
