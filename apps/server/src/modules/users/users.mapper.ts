import type { Payment, Product, User } from "@tgstack/db";
import type { PaymentDto, ProductDto, UserDto } from "@tgstack/shared";

/**
 * Explicit Prisma → JSON mappers. They decide exactly which fields leave the
 * server and turn BigInt Telegram IDs into strings (decision D6).
 */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    telegramId: user.telegramId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    languageCode: user.languageCode,
    locale: user.locale,
    role: user.role,
    isBlocked: user.isBlocked,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}

export function toProductDto(product: Product): ProductDto {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    priceStars: product.priceStars,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
  };
}

export type PaymentWithRelations = Payment & {
  user: Pick<User, "id" | "telegramId" | "username" | "firstName">;
  product: Pick<Product, "id" | "title"> | null;
};

export const paymentInclude = {
  user: { select: { id: true, telegramId: true, username: true, firstName: true } },
  product: { select: { id: true, title: true } },
} as const;

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
