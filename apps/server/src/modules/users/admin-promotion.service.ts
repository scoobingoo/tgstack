import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { AppConfig } from "../config/app-config.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Promotes `ADMIN_TELEGRAM_IDS` to ADMIN on boot. Users who have never talked to
 * the bot are promoted when their row is created (see the user middleware).
 */
@Injectable()
export class AdminPromotionService implements OnApplicationBootstrap {
  private readonly logger = new Logger("Admins");

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const ids = this.config.env.ADMIN_TELEGRAM_IDS;
    if (ids.length === 0) return;
    const { count } = await this.prisma.user.updateMany({
      where: { telegramId: { in: ids }, role: { not: "ADMIN" } },
      data: { role: "ADMIN" },
    });
    if (count > 0) this.logger.log(`Promoted ${count} user(s) from ADMIN_TELEGRAM_IDS`);
  }
}
