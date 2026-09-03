import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { MockBotApi } from "@tgstack/nestjs-grammy/testing";
import { AppModule, type AppModuleOptions } from "../../src/app.module.js";
import { configureApp } from "../../src/bootstrap.js";
import type { Env } from "../../src/config/env.js";
import { createTestEnv } from "./env.js";

export interface TestAppOptions {
  env?: Env;
  bot?: AppModuleOptions["bot"];
  /** Override providers before compiling, e.g. to mock the Bot API. */
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/** Boots the real AppModule (Postgres + Redis from TEST_* URLs) with production HTTP settings. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  const env = options.env ?? createTestEnv();
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot({ env, bot: options.bot ?? defaultBotOptions() })],
  });
  if (options.customize) builder = options.customize(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}

/** A send-only bot backed by an in-memory Bot API, for tests that do not inspect bot calls. */
function defaultBotOptions(): NonNullable<AppModuleOptions["bot"]> {
  const api = new MockBotApi();
  return { mode: "none", client: api.clientOptions, botInfo: api.botInfo };
}
