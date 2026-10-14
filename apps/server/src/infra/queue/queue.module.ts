import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { type ConnectionOptions, type Processor, Queue, Worker, type WorkerOptions } from "bullmq";
import { AppConfig } from "../../config/app-config.js";

/**
 * BullMQ setup shared by the API process (producers) and the worker process
 * (processors). Every queue and worker opens its own Redis connections from
 * `REDIS_URL` and closes them on `close()`; errors are logged, never thrown.
 */
@Injectable()
export class QueueFactory {
  private readonly logger = new Logger("Queue");

  constructor(private readonly config: AppConfig) {}

  get connection(): ConnectionOptions {
    return { url: this.config.env.REDIS_URL };
  }

  createQueue<T>(name: string): Queue<T> {
    const queue = new Queue<T>(name, { connection: this.connection });
    queue.on("error", (error: Error) => this.logger.error(`${name}: ${error.message}`));
    return queue;
  }

  createWorker<T>(
    name: string,
    processor: Processor<T>,
    options: Omit<WorkerOptions, "connection"> = {},
  ): Worker<T> {
    const worker = new Worker<T>(name, processor, { ...options, connection: this.connection });
    worker.on("error", (error: Error) => this.logger.error(`${name} worker: ${error.message}`));
    return worker;
  }
}

/** Imported by both root modules; queues themselves are created by feature modules. */
@Global()
@Module({
  providers: [QueueFactory],
  exports: [QueueFactory],
})
export class QueueModule {}
