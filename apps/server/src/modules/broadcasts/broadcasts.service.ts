import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { Broadcast, Prisma, User } from "@tgstack/db";
import { InjectBot } from "@tgstack/nestjs-grammy";
import type {
  BroadcastContentBody,
  BroadcastDto,
  BroadcastProgressDto,
  ListBroadcastsQuery,
  Paginated,
} from "@tgstack/shared";
import type { Queue } from "bullmq";
import { type Bot, GrammyError } from "grammy";
import type { BotContext } from "../../bot/bot.context.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { CONTROL_JOB, type StartBroadcastJob } from "./broadcast-queues.js";
import { sendBroadcastMessage } from "./broadcast-sender.js";
import { assertAction } from "./broadcast-state.js";

export const BROADCAST_CONTROL_QUEUE_TOKEN = Symbol("BROADCAST_CONTROL_QUEUE");

const authorSelect = { id: true, firstName: true, username: true } as const;
type BroadcastWithAuthor = Broadcast & { author: Pick<User, "id" | "firstName" | "username"> };

export function toProgressDto(broadcast: Broadcast): BroadcastProgressDto {
  return {
    id: broadcast.id,
    status: broadcast.status,
    total: broadcast.total,
    sent: broadcast.sent,
    failed: broadcast.failed,
    startedAt: broadcast.startedAt?.toISOString() ?? null,
    finishedAt: broadcast.finishedAt?.toISOString() ?? null,
  };
}

function toBroadcastDto(broadcast: BroadcastWithAuthor): BroadcastDto {
  return {
    ...toProgressDto(broadcast),
    text: broadcast.text,
    imageUrl: broadcast.imageUrl,
    buttonText: broadcast.buttonText,
    buttonUrl: broadcast.buttonUrl,
    createdAt: broadcast.createdAt.toISOString(),
    author: broadcast.author,
  };
}

function content(body: BroadcastContentBody) {
  return {
    text: body.text,
    imageUrl: body.imageUrl ?? null,
    buttonText: body.buttonText ?? null,
    buttonUrl: body.buttonUrl ?? null,
  };
}

/** Broadcast domain on the API side: drafts, state transitions, previews, progress. */
@Injectable()
export class BroadcastsService implements OnApplicationShutdown {
  constructor(
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Bot<BotContext>,
    @Inject(BROADCAST_CONTROL_QUEUE_TOKEN) private readonly controlQueue: Queue<StartBroadcastJob>,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.controlQueue.close();
  }

  async list(query: ListBroadcastsQuery): Promise<Paginated<BroadcastDto>> {
    const where: Prisma.BroadcastWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.broadcast.findMany({
        where,
        include: { author: { select: authorSelect } },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.broadcast.count({ where }),
    ]);
    return { items: items.map(toBroadcastDto), total, page: query.page, limit: query.limit };
  }

  async get(id: string): Promise<BroadcastDto> {
    return toBroadcastDto(await this.find(id));
  }

  async progress(id: string): Promise<BroadcastProgressDto> {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) throw new NotFoundException("Broadcast not found");
    return toProgressDto(broadcast);
  }

  async create(body: BroadcastContentBody, author: User): Promise<BroadcastDto> {
    const broadcast = await this.prisma.broadcast.create({
      data: { ...content(body), authorId: author.id },
      include: { author: { select: authorSelect } },
    });
    return toBroadcastDto(broadcast);
  }

  /** Drafts can be edited until they are started. */
  async update(id: string, body: BroadcastContentBody): Promise<BroadcastDto> {
    assertAction((await this.find(id)).status, "edit");
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: "DRAFT" },
      data: content(body),
    });
    if (count === 0) assertAction((await this.find(id)).status, "edit");
    return this.get(id);
  }

  /** Sends the broadcast to the requesting admin only. Telegram's errors (e.g. bad HTML) come back as 400. */
  async preview(id: string, admin: User): Promise<void> {
    const broadcast = await this.find(id);
    try {
      await sendBroadcastMessage(this.bot.api, Number(admin.telegramId), broadcast);
    } catch (error) {
      if (error instanceof GrammyError) {
        throw new BadRequestException(
          error.error_code === 403
            ? "Telegram refused: you blocked the bot or never started it. Send /start and retry."
            : `Telegram refused the message: ${error.description}`,
        );
      }
      throw error;
    }
  }

  /** DRAFT → QUEUED, then the worker snapshots recipients and sends. */
  async start(id: string): Promise<BroadcastProgressDto> {
    const broadcast = await this.find(id);
    assertAction(broadcast.status, "start");
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: "DRAFT" },
      data: { status: "QUEUED" },
    });
    if (count === 0) assertAction((await this.find(id)).status, "start");
    await this.controlQueue.add(
      CONTROL_JOB.start,
      { broadcastId: id },
      {
        jobId: `start-${id}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
    return this.progress(id);
  }

  /**
   * Stops a broadcast. Messages already handed to a worker are skipped; the
   * waiting ones are removed by a `purge` job so they do not hold up the
   * rate-limited queue for the next broadcast.
   */
  async cancel(id: string): Promise<BroadcastProgressDto> {
    const broadcast = await this.find(id);
    assertAction(broadcast.status, "cancel");
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: { in: ["DRAFT", "QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    if (count === 0) assertAction((await this.find(id)).status, "cancel");
    if (broadcast.status !== "DRAFT") {
      await this.controlQueue.add(
        CONTROL_JOB.purge,
        { broadcastId: id },
        { jobId: `purge-${id}`, attempts: 3, removeOnComplete: true, removeOnFail: 100 },
      );
    }
    return this.progress(id);
  }

  private async find(id: string): Promise<BroadcastWithAuthor> {
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id },
      include: { author: { select: authorSelect } },
    });
    if (!broadcast) throw new NotFoundException("Broadcast not found");
    return broadcast;
  }
}
