import { z } from "zod";

export const statsSchema = z.object({
  totalUsers: z.number().int(),
  newUsers: z.object({
    today: z.number().int(),
    last7Days: z.number().int(),
    last30Days: z.number().int(),
  }),
  /** Users seen in the last 7 days. */
  activeUsers7d: z.number().int(),
  blockedUsers: z.number().int(),
  /** Sum of paid (not refunded) Telegram Stars payments. */
  revenueStars: z.number().int(),
  /** Sum of paid (not refunded) VND payments (PayOS bank transfers), in đồng. */
  revenueVnd: z.number().int(),
  /** One entry per UTC day for the last 30 days, oldest first; days without sign-ups have 0. */
  dailyNewUsers: z.array(z.object({ date: z.iso.date(), count: z.number().int() })),
});
export type StatsDto = z.infer<typeof statsSchema>;
