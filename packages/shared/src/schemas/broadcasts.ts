import { z } from "zod";
import { SUPPORTED_LOCALES } from "../constants/index.js";
import { htmlTextLength } from "../utils/html.js";
import { isoDateSchema, paginationQuerySchema } from "./common.js";

export const broadcastStatusSchema = z.enum([
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
]);
export type BroadcastStatus = z.infer<typeof broadcastStatusSchema>;

/** Statuses after which nothing changes any more. */
export const TERMINAL_BROADCAST_STATUSES: readonly BroadcastStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "FAILED",
];

/** Bot API limits, counted after HTML entities are parsed. */
export const MESSAGE_TEXT_LIMIT = 4096;
export const PHOTO_CAPTION_LIMIT = 1024;
export const BUTTON_TEXT_LIMIT = 64;

/**
 * Who receives a broadcast. Every condition is optional and they combine with
 * AND; users who blocked the bot are always excluded. Evaluated when the
 * broadcast starts, not when it is saved.
 */
export const broadcastSegmentSchema = z
  .object({
    /** Users whose locale (bot `/language`, Mini App) is one of these. */
    locales: z.array(z.enum(SUPPORTED_LOCALES)).min(1).optional(),
    /** Seen (any update or Mini App request) within the last N days. */
    activeWithinDays: z.number().int().min(1).max(365).optional(),
    /** Not seen for at least N days — win-back campaigns. */
    inactiveForDays: z.number().int().min(1).max(365).optional(),
    /** `buyers`: at least one paid payment; `non-buyers`: none. */
    purchases: z.enum(["buyers", "non-buyers"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.activeWithinDays && value.inactiveForDays) {
      ctx.addIssue({
        code: "custom",
        path: ["inactiveForDays"],
        message: "choose either active within or inactive for, not both",
      });
    }
  });
export type BroadcastSegment = z.infer<typeof broadcastSegmentSchema>;

export const broadcastContentSchema = z
  .object({
    /** Telegram HTML parse mode. */
    text: z.string().trim().min(1),
    imageUrl: z
      .url({ protocol: /^https?$/ })
      .nullable()
      .optional(),
    buttonText: z.string().trim().min(1).max(BUTTON_TEXT_LIMIT).nullable().optional(),
    buttonUrl: z
      .url({ protocol: /^(https?|tg)$/ })
      .nullable()
      .optional(),
    /** Recipients; omitted or null = everyone who did not block the bot. */
    segment: broadcastSegmentSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const limit = value.imageUrl ? PHOTO_CAPTION_LIMIT : MESSAGE_TEXT_LIMIT;
    if (htmlTextLength(value.text) > limit) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: `must be at most ${limit} characters${value.imageUrl ? " with an image" : ""}`,
      });
    }
    if (Boolean(value.buttonText) !== Boolean(value.buttonUrl)) {
      ctx.addIssue({
        code: "custom",
        path: [value.buttonText ? "buttonUrl" : "buttonText"],
        message: "button text and URL go together",
      });
    }
  });
export type BroadcastContentBody = z.input<typeof broadcastContentSchema>;

export const broadcastProgressSchema = z.object({
  id: z.string(),
  status: broadcastStatusSchema,
  total: z.number().int(),
  sent: z.number().int(),
  failed: z.number().int(),
  scheduledAt: isoDateSchema.nullable(),
  startedAt: isoDateSchema.nullable(),
  finishedAt: isoDateSchema.nullable(),
});
export type BroadcastProgressDto = z.infer<typeof broadcastProgressSchema>;

export const broadcastSchema = broadcastProgressSchema.extend({
  text: z.string(),
  imageUrl: z.string().nullable(),
  buttonText: z.string().nullable(),
  buttonUrl: z.string().nullable(),
  segment: broadcastSegmentSchema.nullable(),
  createdAt: isoDateSchema,
  author: z.object({ id: z.string(), firstName: z.string(), username: z.string().nullable() }),
});
export type BroadcastDto = z.infer<typeof broadcastSchema>;

export const listBroadcastsQuerySchema = paginationQuerySchema.extend({
  status: broadcastStatusSchema.optional(),
});
export type ListBroadcastsQuery = z.infer<typeof listBroadcastsQuerySchema>;

/** Latest schedule allowed (Telegram content and audiences change; plan at most a year ahead). */
export const MAX_SCHEDULE_DAYS = 365;

/** `POST /api/admin/broadcasts/:id/schedule` */
export const scheduleBroadcastSchema = z.object({
  /** ISO 8601 with a time zone, e.g. `2026-11-01T09:00:00+07:00`. Must be in the future. */
  scheduledAt: z.iso.datetime({ offset: true }),
});
export type ScheduleBroadcastBody = z.infer<typeof scheduleBroadcastSchema>;

/** `POST /api/admin/broadcasts/audience`: how many users a segment reaches right now. */
export const audienceQuerySchema = z.object({ segment: broadcastSegmentSchema.nullable() });
export type AudienceQueryBody = z.infer<typeof audienceQuerySchema>;
export const audienceSchema = z.object({ count: z.number().int() });
export type AudienceDto = z.infer<typeof audienceSchema>;
