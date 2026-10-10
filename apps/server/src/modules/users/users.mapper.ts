import type { User } from "@tgstack/db";
import type { UserDto } from "@tgstack/shared";

/**
 * Explicit Prisma → JSON mapper: decides exactly which fields leave the server
 * and turns the BigInt Telegram ID into a string (decision D6).
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
