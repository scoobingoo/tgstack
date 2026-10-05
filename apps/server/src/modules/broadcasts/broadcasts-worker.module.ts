import { type DynamicModule, Module } from "@nestjs/common";
import { Api, type ApiClientOptions } from "grammy";
import { AppConfig } from "../config/app-config.js";
import {
  BROADCAST_WORKER_OPTIONS,
  BroadcastWorker,
  type BroadcastWorkerOptions,
  WORKER_BOT_API,
} from "./broadcast.worker.js";

export interface BroadcastWorkerModuleOptions extends BroadcastWorkerOptions {
  /** Bot API client options — tests pass a mocked Bot API (`MockBotApi#clientOptions`). */
  client?: ApiClientOptions;
}

/** Worker side of broadcasts, imported by `WorkerModule` (main.worker.ts). */
@Module({})
export class BroadcastWorkerModule {
  static forRoot(options: BroadcastWorkerModuleOptions = {}): DynamicModule {
    const { client, ...workerOptions } = options;
    return {
      module: BroadcastWorkerModule,
      providers: [
        {
          // A bare API client: no polling, no auto-retry (the worker handles 429 itself).
          provide: WORKER_BOT_API,
          inject: [AppConfig],
          useFactory: (config: AppConfig) =>
            new Api(config.env.BOT_TOKEN, {
              ...client,
              ...(config.env.BOT_TEST_ENVIRONMENT ? { environment: "test" as const } : {}),
            }),
        },
        { provide: BROADCAST_WORKER_OPTIONS, useValue: workerOptions },
        BroadcastWorker,
      ],
      exports: [BroadcastWorker],
    };
  }
}
