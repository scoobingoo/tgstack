import { Module } from "@nestjs/common";
import { Queue } from "bullmq";
import { AppConfig } from "../config/app-config.js";
import { BROADCAST_CONTROL_QUEUE, type StartBroadcastJob } from "./broadcast-queues.js";
import { BROADCAST_CONTROL_QUEUE_TOKEN, BroadcastsService } from "./broadcasts.service.js";
import { BroadcastsAdminController } from "./broadcasts-admin.controller.js";

/**
 * API side of broadcasts (main.ts): admin endpoints and the producer of the
 * control queue. Sending happens in the worker process (BroadcastWorkerModule).
 */
@Module({
  controllers: [BroadcastsAdminController],
  providers: [
    BroadcastsService,
    {
      provide: BROADCAST_CONTROL_QUEUE_TOKEN,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new Queue<StartBroadcastJob>(BROADCAST_CONTROL_QUEUE, {
          // BullMQ creates and closes its own connection from the URL.
          connection: { url: config.env.REDIS_URL },
        }),
    },
  ],
})
export class BroadcastsModule {}
