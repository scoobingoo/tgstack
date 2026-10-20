import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { type Broadcast, Prisma, type User } from "@tgstack/db";
import { InjectBot } from "@tgstack/nestjs-grammy";
import {
  type AudienceDto,
  type BroadcastContentBody,
  type BroadcastDto,
  type BroadcastProgressDto,
  type BroadcastSegment,
  type ListBroadcastsQuery,
  MAX_SCHEDULE_DAYS,
  type Paginated,
} from "@tgstack/shared";
import type { Queue } from "bullmq";
import { type Bot, GrammyError } from "grammy";
import type { BotContext } from "../../bot/bot.context.js";
import { PrismaService } from "../../infra/prisma/prisma.service.js";
import { CONTROL_JOB, enqueueStart, type StartBroadcastJob } from "./broadcast-queues.js";
import { parseSegment, segmentWhere } from "./broadcast-segment.js";
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
    scheduledAt: broadcast.scheduledAt?.toISOString() ?? null,
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
    segment: parseSegment(broadcast.segment),
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
    // Prisma.DbNull stores SQL NULL (a JSON `null` would be a JSON value).
    segment: isEmptySegment(body.segment)
      ? Prisma.DbNull
      : (body.segment as Prisma.InputJsonObject),
  };
}

/** A segment without conditions means everyone: store it as NULL. */
function isEmptySegment(segment: BroadcastSegment | null | undefined): boolean {
  return !segment || Object.values(segment).every((value) => value === undefined);
}

const SCHEDULE_MIN_LEAD_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

  /** How many users a segment reaches right now (the composer shows it live). */
  async audience(segment: BroadcastSegment | null): Promise<AudienceDto> {
    return { count: await this.prisma.user.count({ where: segmentWhere(segment, new Date()) }) };
  }

  /** DRAFT or SCHEDULED → QUEUED now; the worker snapshots recipients and sends. */
  async start(id: string): Promise<BroadcastProgressDto> {
    const broadcast = await this.find(id);
    assertAction(broadcast.status, "start");
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "QUEUED" },
    });
    if (count === 0) assertAction((await this.find(id)).status, "start");
    await enqueueStart(this.controlQueue, id);
    return this.progress(id);
  }

  /**
   * DRAFT or SCHEDULED → SCHEDULED at `scheduledAt` (at least a minute ahead, at
   * most {@link MAX_SCHEDULE_DAYS} days). The worker starts it when it is due.
   */
  async schedule(id: string, scheduledAt: Date): Promise<BroadcastProgressDto> {
    const now = Date.now();
    if (scheduledAt.getTime() < now + SCHEDULE_MIN_LEAD_MS) {
      throw new BadRequestException("scheduledAt must be at least a minute in the future");
    }
    if (scheduledAt.getTime() > now + MAX_SCHEDULE_DAYS * DAY_MS) {
      throw new BadRequestException(`scheduledAt must be within ${MAX_SCHEDULE_DAYS} days`);
    }
    assertAction((await this.find(id)).status, "schedule");
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "SCHEDULED", scheduledAt },
    });
    if (count === 0) assertAction((await this.find(id)).status, "schedule");
    return this.progress(id);
  }

  /** SCHEDULED → DRAFT, so the content can be edited again. */
  async unschedule(id: string): Promise<BroadcastProgressDto> {
    assertAction((await this.find(id)).status, "unschedule");
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "DRAFT", scheduledAt: null },
    });
    if (count === 0) assertAction((await this.find(id)).status, "unschedule");
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
      where: { id, status: { in: ["DRAFT", "SCHEDULED", "QUEUED", "RUNNING"] } },
      data: { status: "CANCELLED", finishedAt: new Date() },
    });
    if (count === 0) assertAction((await this.find(id)).status, "cancel");
    if (broadcast.status === "QUEUED" || broadcast.status === "RUNNING") {
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
