import { utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { InjectRedis } from "./infra/redis/redis.module.js";
import { BroadcastsProcessor } from "./modules/broadcasts/broadcasts.processor.js";

/** Default heartbeat file; the Docker healthcheck of the worker reads its age. */
export const DEFAULT_HEARTBEAT_FILE = join(tmpdir(), "tgstack-worker.heartbeat");
export const HEARTBEAT_FILE = Symbol("HEARTBEAT_FILE");
const INTERVAL_MS = 10_000;
const PING_TIMEOUT_MS = 5_000;
/** Unhealthy for this many beats in a row (1 minute): exit so Docker restarts the worker. */
const MAX_FAILED_BEATS = 6;

/**
 * The worker has no HTTP port to probe. Every 10 s it checks that its queue
 * workers are running and Redis answers, and only then touches a file; the
 * container healthcheck fails when the file is older than a minute. After a
 * minute of failures the process exits, so the restart policy brings it back
 * (Docker does not restart containers that are merely "unhealthy").
 */
@Injectable()
export class WorkerHeartbeat implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("Heartbeat");
  private timer?: NodeJS.Timeout;
  private healthy = true;
  private failedBeats = 0;

  constructor(
    private readonly broadcasts: BroadcastsProcessor,
    @InjectRedis() private readonly redis: Redis,
    @Inject(HEARTBEAT_FILE) private readonly file: string,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.beat();
    this.timer = setInterval(() => void this.beat(), INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async beat(): Promise<boolean> {
    const healthy = this.broadcasts.isRunning() && (await this.redisAnswers());
    if (healthy !== this.healthy) {
      if (healthy) this.logger.log("Healthy again");
      else this.logger.warn("Unhealthy: queue workers stopped or Redis unreachable");
      this.healthy = healthy;
    }
    this.failedBeats = healthy ? 0 : this.failedBeats + 1;
    if (this.failedBeats >= MAX_FAILED_BEATS) {
      this.logger.error("Unhealthy for a minute; exiting so the worker gets restarted");
      // Not a graceful shutdown: closing BullMQ workers can hang while Redis is down.
      // Jobs this process held are picked up again as stalled jobs.
      process.exit(1);
    }
    if (healthy) {
      const now = new Date();
      await utimes(this.file, now, now).catch(() => writeFile(this.file, ""));
    }
    return healthy;
  }

  private async redisAnswers(): Promise<boolean> {
    let timeout: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timeout = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    });
    try {
      const ping = this.redis.ping().then((reply) => reply === "PONG");
      return await Promise.race([ping, timedOut]);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
