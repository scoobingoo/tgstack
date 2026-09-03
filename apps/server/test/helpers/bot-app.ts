import type { NestExpressApplication } from "@nestjs/platform-express";
import { resetDatabase } from "@tgstack/db/testing";
import { GRAMMY_BOT, type GrammyMode } from "@tgstack/nestjs-grammy";
import { MockBotApi, testUser } from "@tgstack/nestjs-grammy/testing";
import type { Bot } from "grammy";
import type { Update, User } from "grammy/types";
import type { Redis } from "ioredis";
import type { BotContext } from "../../src/bot/bot.context.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { REDIS } from "../../src/redis/redis.module.js";
import { createTestApp } from "./app.js";
import { createTestEnv } from "./env.js";

export interface BotTestApp {
  app: NestExpressApplication;
  api: MockBotApi;
  bot: Bot<BotContext>;
  prisma: PrismaService;
  redis: Redis;
  /** Feeds an update through the full middleware pipeline. */
  send(update: Update): Promise<void>;
  /** Texts of `sendMessage`/`editMessageText` calls made so far. */
  texts(): string[];
  close(): Promise<void>;
}

export interface BotTestAppOptions {
  env?: Record<string, string | undefined>;
  mode?: GrammyMode;
  api?: MockBotApi;
}

/** Boots the real app with a mocked Bot API. No request ever reaches Telegram. */
export async function createBotTestApp(options: BotTestAppOptions = {}): Promise<BotTestApp> {
  const api = options.api ?? new MockBotApi();
  const app = await createTestApp({
    env: createTestEnv(options.env),
    bot: { mode: options.mode ?? "none", client: api.clientOptions, botInfo: api.botInfo },
  });
  const bot = app.get<Bot<BotContext>>(GRAMMY_BOT);
  return {
    app,
    api,
    bot,
    prisma: app.get(PrismaService),
    redis: app.get<Redis>(REDIS),
    send: (update) => bot.handleUpdate(update),
    texts: () =>
      api.calls
        .filter((call) => call.method === "sendMessage" || call.method === "editMessageText")
        .map((call) => String(call.payload.text)),
    close: () => app.close(),
  };
}

/** Clears Postgres and the dedicated test Redis DB. Refuses to flush anything but a test DB. */
export async function resetState(target: BotTestApp): Promise<void> {
  await resetDatabase(target.prisma);
  const db = target.redis.options.db ?? 0;
  if (db === 0) throw new Error("Refusing to FLUSHDB Redis DB 0; set TEST_REDIS_URL to a test DB.");
  await target.redis.flushdb();
  target.api.reset();
}

export function user(overrides: Partial<User> = {}): User {
  return { ...testUser, ...overrides };
}
