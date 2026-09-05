import { z } from "zod";
import { isoDateSchema, paginationQuerySchema, telegramIdSchema } from "./common.js";

export const paymentStatusSchema = z.enum(["PAID", "REFUNDED"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  provider: z.string(),
  status: paymentStatusSchema,
  telegramPaymentChargeId: z.string(),
  createdAt: isoDateSchema,
  refundedAt: isoDateSchema.nullable(),
  user: z.object({
    id: z.string(),
    telegramId: telegramIdSchema,
    username: z.string().nullable(),
    firstName: z.string(),
  }),
  product: z.object({ id: z.string(), title: z.string() }).nullable(),
});
export type PaymentDto = z.infer<typeof paymentSchema>;

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  status: paymentStatusSchema.optional(),
  userId: z.string().optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
