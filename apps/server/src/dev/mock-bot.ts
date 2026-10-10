/**
 * Development only: runs the API and the queue worker against an in-memory Bot API,
 * so the admin dashboard can be developed (and smoke-tested) without a bot token.
 *
 *     pnpm --filter @tgstack/server dev:mock
 *
 * - Every message the "bot" would send is printed instead.
 * - An admin user is created; `GET /__dev/login-link` returns a fresh magic link
 *   and one is printed on start.
 */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { MockBotApi } from "@tgstack/nestjs-grammy/testing";
import { AppModule } from "../app.module.js";
import { configureApp, exitOnBootstrapError } from "../bootstrap.js";
import { loadEnv } from "../config/env.js";
import { PrismaService } from "../infra/prisma/prisma.service.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { WorkerModule } from "../worker.module.js";

const MOCK_ADMIN_TELEGRAM_ID = 111_111_111n;

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === "production") throw new Error("The mock bot must never run in production.");

  const api = new MockBotApi().onCall((call) => {
    if (call.method === "sendMessage" || call.method === "sendPhoto") {
      const text = String(call.payload.text ?? call.payload.caption ?? "");
      console.log(`[mock bot] ${call.method} → ${call.payload.chat_id}: ${text.slice(0, 120)}`);
    }
  });
  const bot = { mode: "none" as const, client: api.clientOptions, botInfo: api.botInfo };

  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot({ env, bot }), {
    bufferLogs: true,
    abortOnError: false,
  });
  configureApp(app);

  const prisma = app.get(PrismaService);
  const auth = app.get(AuthService);
  const admin = await prisma.user.upsert({
    where: { telegramId: MOCK_ADMIN_TELEGRAM_ID },
    create: {
      telegramId: MOCK_ADMIN_TELEGRAM_ID,
      firstName: "Mock",
      username: "mock_admin",
      role: "ADMIN",
    },
    update: { role: "ADMIN" },
  });
  // Mounted on the raw adapter, outside /api: only this script has it.
  app.getHttpAdapter().get("/__dev/login-link", async (_req, res) => {
    app.getHttpAdapter().reply(res, { url: await auth.createMagicLink(admin) }, 200);
  });

  await app.listen(env.PORT, env.HOST);
  const worker = await NestFactory.createApplicationContext(
    WorkerModule.forRoot({ env, broadcasts: { client: api.clientOptions } }),
    { bufferLogs: true, abortOnError: false },
  );
  worker.enableShutdownHooks();
  await worker.init();

  console.log(`\n[mock bot] API on http://localhost:${env.PORT} with an in-memory Bot API.`);
  console.log(`[mock bot] Admin login: ${await auth.createMagicLink(admin)}`);
  console.log(`[mock bot] New links: GET http://localhost:${env.PORT}/__dev/login-link\n`);
}

main().catch(exitOnBootstrapError);
