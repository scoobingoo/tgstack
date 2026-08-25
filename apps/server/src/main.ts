import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp, exitOnBootstrapError } from "./bootstrap.js";
import { loadEnv } from "./config/env.js";

/** HTTP API + Telegram bot. */
async function bootstrap(): Promise<void> {
  const env = loadEnv(); // fail fast, before Nest starts, with a readable list of problems
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot({ env }), {
    bufferLogs: true,
    abortOnError: false,
  });
  configureApp(app);
  await app.listen(env.PORT, env.HOST);
}

bootstrap().catch(exitOnBootstrapError);
