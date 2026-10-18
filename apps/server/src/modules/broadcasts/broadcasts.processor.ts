import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { Broadcast, BroadcastStatus } from "@tgstack/db";
import { type Job, type Queue, Worker } from "bullmq";
import { type Api, GrammyError } from "grammy";
import { AppConfig } from "../../config/app-config.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { QueueFactory } from "../../infra/queue/queue.module.js";
import {
  BROADCAST_CONTROL_QUEUE,
  BROADCAST_MESSAGE_QUEUE,
  CONTROL_JOB,
  MESSAGE_ATTEMPTS,
  messageJobId,
  messageLimiter,
  type SendBroadcastMessageJob,
  SNAPSHOT_BATCH_SIZE,
  type StartBroadcastJob,
} from "./broadcast-queues.js";
import { sendBroadcastMessage } from "./broadcast-sender.js";

export const WORKER_BOT_API = Symbol("WORKER_BOT_API");
export const BROADCASTS_PROCESSOR_OPTIONS = Symbol("BROADCASTS_PROCESSOR_OPTIONS");

export interface BroadcastsProcessorOptions {
  /** Messages per second; defaults to `BROADCAST_RATE_PER_SECOND`. Tests raise it. */
  ratePerSecond?: number;
  /** Parallel send jobs per worker process (the limiter still paces them). */
  concurrency?: number;
}

/** How long the worker trusts a cached broadcast status (cancellation latency). */
const STATUS_CACHE_MS = 1_000;

type Counter = "sent" | "failed";

/**
 * Worker side of broadcasts (main.worker.ts):
 * - `broadcast-control`: `start` snapshots non-blocked users into `send` jobs;
 *   `purge` removes the waiting `send` jobs of a cancelled broadcast.
 * - `broadcast-messages`: sends one message per job, globally rate-limited.
 *   429 → pause the whole queue for `retry_after`; 403 → mark the user blocked,
 *   count as failed; other 4xx → failed; network/5xx → retried, then failed.
 */
@Injectable()
export class BroadcastsProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("BroadcastsProcessor");
  private readonly statusCache = new Map<string, { value: Broadcast | null; at: number }>();
  private messageQueue!: Queue<SendBroadcastMessageJob>;
  private controlWorker!: Worker<StartBroadcastJob>;
  private messageWorker!: Worker<SendBroadcastMessageJob>;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly queues: QueueFactory,
    @Inject(WORKER_BOT_API) private readonly api: Api,
    @Inject(BROADCASTS_PROCESSOR_OPTIONS) private readonly options: BroadcastsProcessorOptions,
  ) {}

  onApplicationBootstrap(): void {
    const rate = this.options.ratePerSecond ?? this.config.env.BROADCAST_RATE_PER_SECOND;
    this.messageQueue = this.queues.createQueue(BROADCAST_MESSAGE_QUEUE);
    this.controlWorker = this.queues.createWorker<StartBroadcastJob>(
      BROADCAST_CONTROL_QUEUE,
      (job) => (job.name === CONTROL_JOB.purge ? this.purge(job) : this.snapshot(job)),
      { concurrency: 1 },
    );
    this.messageWorker = this.queues.createWorker<SendBroadcastMessageJob>(
      BROADCAST_MESSAGE_QUEUE,
      (job) => this.send(job),
      { concurrency: this.options.concurrency ?? 4, limiter: messageLimiter(rate) },
    );
    this.controlWorker.on("failed", (job, error) => void this.onSnapshotFailed(job, error));
    this.logger.log(`Broadcast worker started (${rate} msg/s)`);
  }

  async onApplicationShutdown(): Promise<void> {
    // Let in-flight jobs finish, then close the queue (and BullMQ's connections).
    await Promise.all([this.controlWorker?.close(), this.messageWorker?.close()]);
    await this.messageQueue?.close();
  }

  /** Both queue workers are running (used by the worker heartbeat). */
  isRunning(): boolean {
    return Boolean(this.controlWorker?.isRunning() && this.messageWorker?.isRunning());
  }

  /** Enqueues one `send` job per non-blocked user, then flips QUEUED → RUNNING with the final total. */
  async snapshot(job: Job<StartBroadcastJob>): Promise<void> {
    const { broadcastId } = job.data;
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (broadcast?.status !== "QUEUED") return; // cancelled before we got here

    if (!broadcast.startedAt) {
      await this.prisma.broadcast.update({
        where: { id: broadcastId },
        data: { startedAt: new Date() },
      });
    }
    let cursor = job.data.cursor;
    let enqueued = job.data.enqueued ?? 0;

    for (;;) {
      if (enqueued > 0 && !(await this.isStillQueued(broadcastId))) return; // cancelled meanwhile
      const users = await this.prisma.user.findMany({
        where: { isBlocked: false },
        select: { id: true, telegramId: true },
        orderBy: { id: "asc" },
        take: SNAPSHOT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (users.length === 0) break;

      await this.messageQueue.addBulk(
        users.map((user) => ({
          name: "send",
          data: { broadcastId, userId: user.id, chatId: user.telegramId.toString() },
          opts: {
            jobId: messageJobId(broadcastId, user.id),
            attempts: MESSAGE_ATTEMPTS,
            backoff: { type: "exponential", delay: 2_000 },
            removeOnComplete: true,
            removeOnFail: 1_000,
          },
        })),
      );
      enqueued += users.length;
      cursor = users.at(-1)?.id;
      await job.updateData({ broadcastId, cursor, enqueued });
    }

    const { count } = await this.prisma.broadcast.updateMany({
      where: { id: broadcastId, status: "QUEUED" },
      data: { status: "RUNNING", total: enqueued },
    });
    this.statusCache.delete(broadcastId);
    if (count === 0) return; // cancelled during the snapshot
    this.logger.log(`Broadcast ${broadcastId}: ${enqueued} recipient(s) queued`);
    // Every message may already be done (or there were no recipients).
    await this.completeIfDone(broadcastId);
  }

  /**
   * Removes the waiting, delayed and retrying `send` jobs of a cancelled broadcast.
   * Job IDs are derived from user IDs, so this walks the users instead of
   * scanning the whole queue. Jobs a worker already holds are skipped by `send`.
   */
  async purge(job: Job<StartBroadcastJob>): Promise<void> {
    const { broadcastId } = job.data;
    this.statusCache.delete(broadcastId);
    let cursor: string | undefined;
    let removed = 0;
    for (;;) {
      const users = await this.prisma.user.findMany({
        select: { id: true },
        orderBy: { id: "asc" },
        take: SNAPSHOT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (users.length === 0) break;
      const results = await Promise.all(
        users.map((user) =>
          this.messageQueue.remove(messageJobId(broadcastId, user.id)).catch(() => 0),
        ),
      );
      removed += results.filter((result) => result === 1).length;
      cursor = users.at(-1)?.id;
    }
    this.logger.log(`Broadcast ${broadcastId} cancelled: ${removed} queued message(s) removed`);
  }

  async send(job: Job<SendBroadcastMessageJob>): Promise<void> {
    const { broadcastId, userId, chatId } = job.data;
    const broadcast = await this.cachedBroadcast(broadcastId);
    if (!broadcast || !isSending(broadcast.status)) return; // cancelled/failed: skip, do not count

    try {
      await sendBroadcastMessage(this.api, Number(chatId), broadcast);
    } catch (error) {
      if (error instanceof GrammyError && error.error_code === 429) {
        // Telegram asks everyone to slow down: pause the whole queue, retry this job later.
        const waitMs = Math.max(1, error.parameters.retry_after ?? 1) * 1_000;
        this.logger.warn(`Rate limited by Telegram; pausing broadcasts for ${waitMs} ms`);
        await this.messageQueue.rateLimit(waitMs);
        throw Worker.RateLimitError();
      }
      if (error instanceof GrammyError && error.error_code === 403) {
        // Bot blocked or user deactivated: remember it, never retry.
        await this.prisma.user.updateMany({ where: { id: userId }, data: { isBlocked: true } });
        await this.count(broadcastId, "failed");
        return;
      }
      if (error instanceof GrammyError && error.error_code >= 400 && error.error_code < 500) {
        // Chat not found, bad request…: retrying cannot help.
        await this.count(broadcastId, "failed");
        return;
      }
      if (job.attemptsMade + 1 < (job.opts.attempts ?? 1)) throw error; // transient: retry with backoff
      this.logger.warn(`Giving up on ${chatId} for ${broadcastId}: ${String(error)}`);
      await this.count(broadcastId, "failed");
      return;
    }
    await this.count(broadcastId, "sent");
  }

  /**
   * Increments a counter and, in the same statement, completes the broadcast when
   * `sent + failed` reaches `total` (only once it is RUNNING, i.e. the total is final).
   */
  private async count(broadcastId: string, counter: Counter): Promise<void> {
    const sentDelta = counter === "sent" ? 1 : 0;
    const failedDelta = counter === "failed" ? 1 : 0;
    await this.prisma.$executeRaw`
      UPDATE "Broadcast"
      SET "sent" = "sent" + ${sentDelta},
          "failed" = "failed" + ${failedDelta},
          "status" = CASE WHEN "status" = 'RUNNING' AND "sent" + "failed" + 1 >= "total"
                          THEN 'COMPLETED'::"BroadcastStatus" ELSE "status" END,
          "finishedAt" = CASE WHEN "status" = 'RUNNING' AND "sent" + "failed" + 1 >= "total"
                              THEN now() ELSE "finishedAt" END
      WHERE "id" = ${broadcastId}`;
  }

  private async isStillQueued(broadcastId: string): Promise<boolean> {
    const row = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: { status: true },
    });
    return row?.status === "QUEUED";
  }

  private async completeIfDone(broadcastId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "Broadcast" SET "status" = 'COMPLETED', "finishedAt" = now()
      WHERE "id" = ${broadcastId} AND "status" = 'RUNNING' AND "sent" + "failed" >= "total"`;
  }

  private async onSnapshotFailed(
    job: Job<StartBroadcastJob> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return; // will be retried
    if (job.name !== CONTROL_JOB.start) {
      this.logger.warn(`Could not purge broadcast ${job.data.broadcastId}: ${error.message}`);
      return;
    }
    this.logger.error(`Broadcast ${job.data.broadcastId} failed: ${error.message}`);
    await this.prisma.broadcast.updateMany({
      where: { id: job.data.broadcastId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: "FAILED", finishedAt: new Date() },
    });
  }

  /** Content and status, cached briefly so 25 msg/s do not mean 25 identical reads/s. */
  private async cachedBroadcast(id: string): Promise<Broadcast | null> {
    const cached = this.statusCache.get(id);
    if (cached && Date.now() - cached.at < STATUS_CACHE_MS) return cached.value;
    const value = await this.prisma.broadcast.findUnique({ where: { id } });
    this.statusCache.set(id, { value, at: Date.now() });
    return value;
  }
}

function isSending(status: BroadcastStatus): boolean {
  return status === "QUEUED" || status === "RUNNING";
}
