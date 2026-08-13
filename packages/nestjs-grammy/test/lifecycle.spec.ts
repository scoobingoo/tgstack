import "reflect-metadata";
import { Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Context } from "grammy";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { Update } from "../src/decorators/update.decorator.js";
import {
  Ctx,
  GrammyLifecycle,
  GrammyModule,
  type GrammyModuleOptions,
  Start,
} from "../src/index.js";
import { createCommandUpdate, MockBotApi } from "../src/testing/index.js";

const received: number[] = [];

@Update()
class StartUpdate {
  @Start()
  async start(@Ctx() ctx: Context) {
    received.push(ctx.update.update_id);
    await ctx.reply("hi");
  }
}

@Module({ providers: [StartUpdate] })
class BotFeatureModule {}

async function createApp(options: Partial<GrammyModuleOptions>, api = new MockBotApi()) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      GrammyModule.forRoot({
        token: "1:TEST",
        botConfig: { botInfo: api.botInfo },
        transformers: [api.transformer],
        ...options,
      }),
      BotFeatureModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return { app, api };
}

describe("polling mode", () => {
  it("clears the webhook, polls updates and stops on shutdown", async () => {
    received.length = 0;
    const api = new MockBotApi();
    const { app } = await createApp(
      { mode: "polling", polling: { dropPendingUpdates: true, allowedUpdates: ["message"] } },
      api,
    );
    const lifecycle = app.get(GrammyLifecycle);
    expect(lifecycle.isPolling()).toBe(true);
    expect(api.callsTo("deleteWebhook")[0]?.payload).toEqual({ drop_pending_updates: true });

    api.pushUpdate(createCommandUpdate("start", "", { updateId: 777 }));
    await vi.waitFor(() => expect(received).toEqual([777]), { timeout: 2000 });
    expect(api.callsTo("sendMessage")).toHaveLength(1);

    await app.close();
    expect(lifecycle.isPolling()).toBe(false);
  });
});

describe("webhook mode", () => {
  const secretToken = "webhook_secret-123";

  it("mounts the handler and verifies the secret token header", async () => {
    received.length = 0;
    const { app, api } = await createApp({ mode: "webhook", webhook: { secretToken } });
    const server = app.getHttpServer();
    const update = createCommandUpdate("start", "", { updateId: 900 });

    await request(server).post("/telegram/webhook").send(update).expect(401);
    await request(server)
      .post("/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", "wrong")
      .send(update)
      .expect(401);
    expect(received).toEqual([]);

    await request(server)
      .post("/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", secretToken)
      .send(update)
      .expect(200);
    expect(received).toEqual([900]);
    expect(api.callsTo("sendMessage")).toHaveLength(1);
    expect(api.callsTo("setWebhook")).toHaveLength(0);
    await app.close();
  });

  it("calls setWebhook on bootstrap when asked to", async () => {
    const { app, api } = await createApp({
      mode: "webhook",
      webhook: {
        secretToken,
        path: "/hooks/bot",
        url: "https://example.com/hooks/bot",
        setWebhook: true,
        allowedUpdates: ["message", "callback_query"],
      },
    });
    expect(api.callsTo("setWebhook")[0]?.payload).toEqual({
      url: "https://example.com/hooks/bot",
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
    });
    await request(app.getHttpServer())
      .post("/hooks/bot")
      .set("X-Telegram-Bot-Api-Secret-Token", secretToken)
      .send(createCommandUpdate("start"))
      .expect(200);
    await app.close();
  });

  it("does not mount the route when autoMount is false", async () => {
    const { app } = await createApp({ mode: "webhook", webhook: { autoMount: false } });
    await request(app.getHttpServer()).post("/telegram/webhook").send({}).expect(404);
    expect(typeof app.get(GrammyLifecycle).createWebhookCallback()).toBe("function");
    await app.close();
  });

  it("requires an HTTP application to auto-mount", async () => {
    const api = new MockBotApi();
    const moduleRef = await Test.createTestingModule({
      imports: [
        GrammyModule.forRoot({
          token: "1:TEST",
          mode: "webhook",
          botConfig: { botInfo: api.botInfo },
          transformers: [api.transformer],
        }),
      ],
    }).compile();
    // A testing module is a plain application context: no HTTP adapter.
    await expect(moduleRef.init()).rejects.toThrow(/HTTP application/);
  });
});

describe("none mode", () => {
  it("neither polls nor calls the Bot API on bootstrap", async () => {
    const { app, api } = await createApp({ mode: "none" });
    expect(app.get(GrammyLifecycle).isPolling()).toBe(false);
    expect(api.calls).toEqual([]);
    await app.close();
  });
});
