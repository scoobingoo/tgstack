import { z } from "zod";
import {
  isoDateSchema,
  paginationQuerySchema,
  queryBooleanSchema,
  telegramIdSchema,
} from "./common.js";
import { paymentSchema } from "./payments.js";

export const roleSchema = z.enum(["USER", "ADMIN"]);
export type Role = z.infer<typeof roleSchema>;

export const userSchema = z.object({
  id: z.string(),
  telegramId: telegramIdSchema,
  username: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  languageCode: z.string().nullable(),
  locale: z.string(),
  role: roleSchema,
  isBlocked: z.boolean(),
  createdAt: isoDateSchema,
  lastSeenAt: isoDateSchema,
});
export type UserDto = z.infer<typeof userSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  /** Matches username, first/last name (case-insensitive) or an exact Telegram ID. */
  search: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  blocked: queryBooleanSchema.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updateUserSchema = z.object({ role: roleSchema });
export type UpdateUserBody = z.infer<typeof updateUserSchema>;

/** A user with their latest payments (admin user drawer). */
export const userDetailSchema = userSchema.extend({
  payments: z.array(paymentSchema),
  paymentsCount: z.number().int(),
  totalSpentStars: z.number().int(),
  /** EXAMPLE: onboarding answers, if any. */
  onboarding: z.unknown(),
});
export type UserDetailDto = z.infer<typeof userDetailSchema>;
