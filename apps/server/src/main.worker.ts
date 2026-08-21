import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { exitOnBootstrapError } from "./bootstrap.js";
import { loadEnv } from "./config/env.js";
import { WorkerModule } from "./worker.module.js";

/** Background worker: processes BullMQ queues (broadcasts). Scales independently of the API. */
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot({ env }), {
    bufferLogs: true,
    abortOnError: false,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.init();
  app.get(Logger).log("Worker started", "Worker");
}

bootstrap().catch(exitOnBootstrapError);
