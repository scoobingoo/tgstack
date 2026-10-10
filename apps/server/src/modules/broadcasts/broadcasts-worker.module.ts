import { type DynamicModule, Module } from "@nestjs/common";
import { Api, type ApiClientOptions } from "grammy";
import { AppConfig } from "../../config/app-config.js";
import {
  BROADCASTS_PROCESSOR_OPTIONS,
  BroadcastsProcessor,
  type BroadcastsProcessorOptions,
  WORKER_BOT_API,
} from "./broadcasts.processor.js";

export interface BroadcastsWorkerModuleOptions extends BroadcastsProcessorOptions {
  /** Bot API client options — tests pass a mocked Bot API (`MockBotApi#clientOptions`). */
  client?: ApiClientOptions;
}

/** Worker side of broadcasts, imported by `WorkerModule` (main.worker.ts). */
@Module({})
export class BroadcastsWorkerModule {
  static forRoot(options: BroadcastsWorkerModuleOptions = {}): DynamicModule {
    const { client, ...workerOptions } = options;
    return {
      module: BroadcastsWorkerModule,
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
        { provide: BROADCASTS_PROCESSOR_OPTIONS, useValue: workerOptions },
        BroadcastsProcessor,
      ],
      exports: [BroadcastsProcessor],
    };
  }
}
