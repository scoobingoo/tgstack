import { Injectable } from "@nestjs/common";
import type { User } from "@tgstack/db";
import { negotiateLocale } from "@tgstack/i18n";
import { AppConfig } from "../config/app-config.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** A Telegram user as reported by an update (`ctx.from`) or by Mini App `initData`. */
export interface TelegramProfile {
  id: number;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  languageCode?: string | null;
}

@Injectable()
export class UsersService {
  private readonly adminIds: Set<bigint>;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfig,
  ) {
    this.adminIds = new Set(config.env.ADMIN_TELEGRAM_IDS);
  }

  /**
   * Creates the user on first contact (locale from Telegram, ADMIN role for
   * `ADMIN_TELEGRAM_IDS`) or refreshes their profile and `lastSeenAt`.
   * `isBlocked` is only changed when given (bot updates know it, the Mini App does not).
   */
  upsertFromTelegram(
    profile: TelegramProfile,
    options: { isBlocked?: boolean } = {},
  ): Promise<User> {
    const telegramId = BigInt(profile.id);
    const fields = {
      username: profile.username ?? null,
      firstName: profile.firstName,
      lastName: profile.lastName ?? null,
      languageCode: profile.languageCode ?? null,
    };
    const blocked = options.isBlocked === undefined ? {} : { isBlocked: options.isBlocked };
    return this.prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        ...fields,
        ...blocked,
        locale: negotiateLocale(profile.languageCode),
        role: this.adminIds.has(telegramId) ? "ADMIN" : "USER",
      },
      update: { ...fields, ...blocked, lastSeenAt: new Date() },
    });
  }
}
