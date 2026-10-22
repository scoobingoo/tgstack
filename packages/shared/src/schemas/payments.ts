import { z } from "zod";
import { isoDateSchema, paginationQuerySchema, telegramIdSchema } from "./common.js";

export const paymentStatusSchema = z.enum(["PAID", "REFUNDED"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * `automatic`: the provider returns the money (Telegram Stars `refundStarPayment`).
 * `manual`: the gateway has no refund API (PayOS); the admin transfers the money
 * back from the bank and the dashboard only records it.
 */
export const refundModeSchema = z.enum(["automatic", "manual"]);
export type RefundMode = z.infer<typeof refundModeSchema>;

export const paymentSchema = z.object({
  id: z.string(),
  /** In the currency's unit: Stars for XTR, whole đồng for VND. */
  amount: z.number().int(),
  currency: z.string(),
  provider: z.string(),
  status: paymentStatusSchema,
  refundMode: refundModeSchema,
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

/** Status of a bank-transfer checkout (PayOS). */
export const paymentOrderStatusSchema = z.enum(["PENDING", "PAID", "CANCELLED", "EXPIRED"]);
export type PaymentOrderStatus = z.infer<typeof paymentOrderStatusSchema>;

/** `POST /api/app/products/:id/checkout` (EXAMPLE shop): a PayOS checkout page with a VietQR code. */
export const checkoutSchema = z.object({
  orderCode: z.number().int(),
  url: z.url(),
  amount: z.number().int(),
  currency: z.string(),
  expiresAt: isoDateSchema,
});
export type CheckoutDto = z.infer<typeof checkoutSchema>;

/** `GET /api/app/payment-orders/:orderCode`: the Mini App polls it while the user pays. */
export const paymentOrderSchema = z.object({
  orderCode: z.number().int(),
  status: paymentOrderStatusSchema,
  amount: z.number().int(),
  currency: z.string(),
  expiresAt: isoDateSchema,
  paidAt: isoDateSchema.nullable(),
});
export type PaymentOrderDto = z.infer<typeof paymentOrderSchema>;
