import { z } from "zod";
import { htmlTextLength } from "../html.js";
import { isoDateSchema, paginationQuerySchema } from "./common.js";

export const broadcastStatusSchema = z.enum([
  "DRAFT",
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
  startedAt: isoDateSchema.nullable(),
  finishedAt: isoDateSchema.nullable(),
});
export type BroadcastProgressDto = z.infer<typeof broadcastProgressSchema>;

export const broadcastSchema = broadcastProgressSchema.extend({
  text: z.string(),
  imageUrl: z.string().nullable(),
  buttonText: z.string().nullable(),
  buttonUrl: z.string().nullable(),
  createdAt: isoDateSchema,
  author: z.object({ id: z.string(), firstName: z.string(), username: z.string().nullable() }),
});
export type BroadcastDto = z.infer<typeof broadcastSchema>;

export const listBroadcastsQuerySchema = paginationQuerySchema.extend({
  status: broadcastStatusSchema.optional(),
});
export type ListBroadcastsQuery = z.infer<typeof listBroadcastsQuerySchema>;
