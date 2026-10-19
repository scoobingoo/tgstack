import {
  Body,
  Get,
  HttpCode,
  type MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
} from "@nestjs/swagger";
import type { User } from "@tgstack/db";
import {
  type AudienceDto,
  type AudienceQueryBody,
  audienceQuerySchema,
  audienceSchema,
  type BroadcastContentBody,
  type BroadcastDto,
  type BroadcastProgressDto,
  broadcastContentSchema,
  broadcastProgressSchema,
  broadcastSchema,
  errorResponseSchema,
  type ListBroadcastsQuery,
  listBroadcastsQuerySchema,
  type Paginated,
  paginatedSchema,
  type ScheduleBroadcastBody,
  scheduleBroadcastSchema,
} from "@tgstack/shared";
import {
  distinctUntilChanged,
  from,
  interval,
  map,
  type Observable,
  startWith,
  switchMap,
  takeWhile,
} from "rxjs";
import { AdminController } from "../../common/decorators/admin-controller.decorator.js";
import { CurrentAdmin } from "../../common/decorators/current-admin.decorator.js";
import { isTerminal } from "./broadcast-state.js";
import { BroadcastsService } from "./broadcasts.service.js";

/** How often the progress stream re-reads the counters. */
export const PROGRESS_INTERVAL_MS = 1_000;

@AdminController("broadcasts", "admin: broadcasts")
export class BroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  @ApiOperation({ summary: "List broadcasts, newest first" })
  @ApiOkResponse({ standardSchema: paginatedSchema(broadcastSchema) })
  list(
    @Query({ schema: listBroadcastsQuerySchema }) query: ListBroadcastsQuery,
  ): Promise<Paginated<BroadcastDto>> {
    return this.broadcasts.list(query);
  }

  @Post()
  @ApiOperation({ summary: "Create a draft" })
  @ApiCreatedResponse({ standardSchema: broadcastSchema })
  create(
    @Body({ schema: broadcastContentSchema }) body: BroadcastContentBody,
    @CurrentAdmin() admin: User,
  ): Promise<BroadcastDto> {
    return this.broadcasts.create(body, admin);
  }

  @Get(":id")
  @ApiOperation({ summary: "A broadcast with its progress counters" })
  @ApiOkResponse({ standardSchema: broadcastSchema })
  @ApiNotFoundResponse({ standardSchema: errorResponseSchema })
  get(@Param("id") id: string): Promise<BroadcastDto> {
    return this.broadcasts.get(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit a draft (replaces its content)" })
  @ApiOkResponse({ standardSchema: broadcastSchema })
  @ApiConflictResponse({ description: "Not a draft any more", standardSchema: errorResponseSchema })
  update(
    @Param("id") id: string,
    @Body({ schema: broadcastContentSchema }) body: BroadcastContentBody,
  ): Promise<BroadcastDto> {
    return this.broadcasts.update(id, body);
  }

  @Post(":id/preview")
  @HttpCode(204)
  @ApiOperation({ summary: "Send the message to yourself only" })
  @ApiNoContentResponse()
  async preview(@Param("id") id: string, @CurrentAdmin() admin: User): Promise<void> {
    await this.broadcasts.preview(id, admin);
  }

  @Post("audience")
  @HttpCode(200)
  @ApiOperation({ summary: "How many users a segment reaches right now" })
  @ApiOkResponse({ standardSchema: audienceSchema })
  audience(@Body({ schema: audienceQuerySchema }) body: AudienceQueryBody): Promise<AudienceDto> {
    return this.broadcasts.audience(body.segment);
  }

  @Post(":id/schedule")
  @HttpCode(200)
  @ApiOperation({ summary: "Send later (DRAFT/SCHEDULED → SCHEDULED)" })
  @ApiOkResponse({ standardSchema: broadcastProgressSchema })
  @ApiConflictResponse({ description: "Already started", standardSchema: errorResponseSchema })
  schedule(
    @Param("id") id: string,
    @Body({ schema: scheduleBroadcastSchema }) body: ScheduleBroadcastBody,
  ): Promise<BroadcastProgressDto> {
    return this.broadcasts.schedule(id, new Date(body.scheduledAt));
  }

  @Post(":id/unschedule")
  @HttpCode(200)
  @ApiOperation({ summary: "Back to draft (SCHEDULED → DRAFT)" })
  @ApiOkResponse({ standardSchema: broadcastProgressSchema })
  @ApiConflictResponse({ description: "Not scheduled", standardSchema: errorResponseSchema })
  unschedule(@Param("id") id: string): Promise<BroadcastProgressDto> {
    return this.broadcasts.unschedule(id);
  }

  @Post(":id/start")
  @HttpCode(200)
  @ApiOperation({ summary: "Start sending now (DRAFT/SCHEDULED → QUEUED)" })
  @ApiOkResponse({ standardSchema: broadcastProgressSchema })
  @ApiConflictResponse({ description: "Already started", standardSchema: errorResponseSchema })
  start(@Param("id") id: string): Promise<BroadcastProgressDto> {
    return this.broadcasts.start(id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @ApiOperation({ summary: "Cancel a draft, scheduled, queued or running broadcast" })
  @ApiOkResponse({ standardSchema: broadcastProgressSchema })
  @ApiConflictResponse({ description: "Already finished", standardSchema: errorResponseSchema })
  cancel(@Param("id") id: string): Promise<BroadcastProgressDto> {
    return this.broadcasts.cancel(id);
  }

  /**
   * Server-Sent Events: a `progress` event whenever the counters change, ending
   * after a terminal status. Each event's data is a `BroadcastProgressDto`.
   */
  @Sse(":id/events")
  @ApiOperation({ summary: "Progress stream (text/event-stream)" })
  @ApiProduces("text/event-stream")
  events(@Param("id") id: string): Observable<MessageEvent> {
    return interval(PROGRESS_INTERVAL_MS).pipe(
      startWith(0),
      switchMap(() => from(this.broadcasts.progress(id))),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      takeWhile((progress) => !isTerminal(progress.status), true),
      map((progress) => ({ type: "progress", data: progress })),
    );
  }
}
