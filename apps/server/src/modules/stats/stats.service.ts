import { Injectable } from "@nestjs/common";
import type { StatsDto } from "@tgstack/shared";
import { PrismaService } from "../../infra/prisma/prisma.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 30;

/** Dashboard numbers. Day boundaries are UTC. */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(now = new Date()): Promise<StatsDto> {
    const today = startOfUtcDay(now);
    const days = (n: number) => new Date(today.getTime() - n * DAY_MS);
    const seriesStart = days(SERIES_DAYS - 1);

    const [totalUsers, newToday, new7, new30, active7, blocked, revenue, daily] = await Promise.all(
      [
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: { gte: today } } }),
        this.prisma.user.count({ where: { createdAt: { gte: days(6) } } }),
        this.prisma.user.count({ where: { createdAt: { gte: seriesStart } } }),
        this.prisma.user.count({
          where: { lastSeenAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
        }),
        this.prisma.user.count({ where: { isBlocked: true } }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: "PAID", currency: "XTR" },
        }),
        this.prisma.$queryRaw<{ day: string; count: number }[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, count(*)::int AS count
        FROM "User"
        WHERE "createdAt" >= ${seriesStart}
        GROUP BY 1`,
      ],
    );

    const counts = new Map(daily.map((row) => [row.day, row.count]));
    const dailyNewUsers = Array.from({ length: SERIES_DAYS }, (_, i) => {
      const date = new Date(seriesStart.getTime() + i * DAY_MS).toISOString().slice(0, 10);
      return { date, count: counts.get(date) ?? 0 };
    });

    return {
      totalUsers,
      newUsers: { today: newToday, last7Days: new7, last30Days: new30 },
      activeUsers7d: active7,
      blockedUsers: blocked,
      revenueStars: revenue._sum.amount ?? 0,
      dailyNewUsers,
    };
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
