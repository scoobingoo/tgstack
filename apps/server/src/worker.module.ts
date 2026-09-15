import { type DynamicModule, Module } from "@nestjs/common";
import {
  BroadcastWorkerModule,
  type BroadcastWorkerModuleOptions,
} from "./broadcasts/broadcast-worker.module.js";
import { LoggingModule } from "./common/logging.js";
import { ConfigModule } from "./config/app-config.js";
import type { Env } from "./config/env.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedisModule } from "./redis/redis.module.js";

/** Queue worker process (`main.worker.ts`): BullMQ processors, no HTTP server. */
@Module({})
export class WorkerModule {
  static forRoot(
    options: { env?: Env; broadcasts?: BroadcastWorkerModuleOptions } = {},
  ): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(options.env),
        LoggingModule,
        PrismaModule,
        RedisModule,
        BroadcastWorkerModule.forRoot(options.broadcasts),
      ],
    };
  }
}
