import { Module } from "@nestjs/common";
import { QueueFactory } from "../../infra/queue/queue.module.js";
import { BROADCAST_CONTROL_QUEUE, type StartBroadcastJob } from "./broadcast-queues.js";
import { BroadcastsController } from "./broadcasts.controller.js";
import { BROADCAST_CONTROL_QUEUE_TOKEN, BroadcastsService } from "./broadcasts.service.js";

/**
 * API side of broadcasts (main.ts): admin endpoints and the producer of the
 * control queue. Sending happens in the worker process (BroadcastsWorkerModule).
 */
@Module({
  controllers: [BroadcastsController],
  providers: [
    BroadcastsService,
    {
      provide: BROADCAST_CONTROL_QUEUE_TOKEN,
      inject: [QueueFactory],
      useFactory: (queues: QueueFactory) =>
        queues.createQueue<StartBroadcastJob>(BROADCAST_CONTROL_QUEUE),
    },
  ],
})
export class BroadcastsModule {}
