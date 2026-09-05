import { z } from "zod";

/** `?page=1&limit=20` — 1-based page, at most 100 rows. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Response envelope of every paginated list. */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
  });
}
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Telegram IDs travel as strings (decision D6). */
export const telegramIdSchema = z.string().regex(/^-?\d+$/, "must be a numeric string");

/** ISO-8601 timestamp as produced by `Date#toJSON()`. */
export const isoDateSchema = z.iso.datetime({ offset: true });

/** Query-string boolean: "true"/"false"/"1"/"0". */
export const queryBooleanSchema = z.stringbool();

/** Body of every error response. */
export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
