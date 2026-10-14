import { z } from "zod";
import { SUPPORTED_LOCALES } from "../constants/index.js";
import { telegramIdSchema } from "./common.js";

/** The signed-in Mini App user (`GET /api/app/me`). */
export const appMeSchema = z.object({
  id: z.string(),
  telegramId: telegramIdSchema,
  firstName: z.string(),
  lastName: z.string().nullable(),
  username: z.string().nullable(),
  /** Locale shared with the bot (`/language`). */
  locale: z.string(),
  /** EXAMPLE: onboarding answers, if any. */
  onboarding: z.unknown(),
});
export type AppMeDto = z.infer<typeof appMeSchema>;

export const updateAppMeSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});
export type UpdateAppMeBody = z.infer<typeof updateAppMeSchema>;

/** EXAMPLE: shop — an invoice link to open with `openInvoice()`. */
export const invoiceLinkSchema = z.object({ url: z.url() });
export type InvoiceLinkDto = z.infer<typeof invoiceLinkSchema>;
