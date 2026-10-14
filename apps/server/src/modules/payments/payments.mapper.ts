import type { Payment, Product, User } from "@tgstack/db";
import type { PaymentDto } from "@tgstack/shared";

export type PaymentWithRelations = Payment & {
  user: Pick<User, "id" | "telegramId" | "username" | "firstName">;
  product: Pick<Product, "id" | "title"> | null;
};

/** Prisma `include` that loads what {@link toPaymentDto} needs. */
export const paymentInclude = {
  user: { select: { id: true, telegramId: true, username: true, firstName: true } },
  product: { select: { id: true, title: true } },
} as const;

/** Prisma → JSON mapper; the BigInt Telegram ID becomes a string (decision D6). */
export function toPaymentDto(payment: PaymentWithRelations): PaymentDto {
  return {
    id: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    provider: payment.provider,
    status: payment.status,
    telegramPaymentChargeId: payment.telegramPaymentChargeId,
    createdAt: payment.createdAt.toISOString(),
    refundedAt: payment.refundedAt?.toISOString() ?? null,
    user: {
      id: payment.user.id,
      telegramId: payment.user.telegramId.toString(),
      username: payment.user.username,
      firstName: payment.user.firstName,
    },
    product: payment.product ? { id: payment.product.id, title: payment.product.title } : null,
  };
}
