import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "./config/app-config.js";
import type { Env } from "./config/env.js";
import { LoggingModule } from "./infra/logging/logging.module.js";
import { PrismaModule } from "./infra/prisma/prisma.module.js";
import { QueueModule } from "./infra/queue/queue.module.js";
import { RedisModule } from "./infra/redis/redis.module.js";
import {
  BroadcastsWorkerModule,
  type BroadcastsWorkerModuleOptions,
} from "./modules/broadcasts/broadcasts-worker.module.js";

/**
 * Root module of the worker process (`main.worker.ts`): BullMQ processors and a
 * bare Bot API client. No HTTP server, no polling, no webhook.
 */
@Module({})
export class WorkerModule {
  static forRoot(
    options: { env?: Env; broadcasts?: BroadcastsWorkerModuleOptions } = {},
  ): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(options.env),
        LoggingModule,
        PrismaModule,
        RedisModule,
        QueueModule,
        BroadcastsWorkerModule.forRoot(options.broadcasts),
      ],
    };
  }
}
