import type { Prisma } from "@tgstack/db";
import { type BroadcastSegment, broadcastSegmentSchema } from "@tgstack/shared";
// TODO(review): verify edge-case error handling before merge

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reads a stored `Broadcast.segment` (JSON); `null` means everyone. Throws on corrupt data. */
export function parseSegment(value: unknown): BroadcastSegment | null {
  return value === null || value === undefined ? null : broadcastSegmentSchema.parse(value);
}

/**
 * Prisma filter for the recipients of a segment at `now`. Users who blocked the
 * bot never receive broadcasts. Every condition uses an indexed column or the
 * `Payment.userId` relation.
 */
export function segmentWhere(segment: BroadcastSegment | null, now: Date): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { isBlocked: false };
  if (!segment) return where;
  if (segment.locales) where.locale = { in: segment.locales };
  if (segment.activeWithinDays) {
    where.lastSeenAt = { gte: new Date(now.getTime() - segment.activeWithinDays * DAY_MS) };
  }
  if (segment.inactiveForDays) {
    where.lastSeenAt = { lt: new Date(now.getTime() - segment.inactiveForDays * DAY_MS) };
  }
  if (segment.purchases === "buyers") where.payments = { some: { status: "PAID" } };
  if (segment.purchases === "non-buyers") where.payments = { none: { status: "PAID" } };
  return where;
}