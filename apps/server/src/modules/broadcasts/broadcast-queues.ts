import { QUEUE_NAMES } from "@tgstack/shared";

/**
 * Control queue: a `start` job per broadcast snapshots the recipients; a `purge`
 * job after a cancel removes its messages that are still waiting.
 */
export const BROADCAST_CONTROL_QUEUE = QUEUE_NAMES.broadcastControl;
export const CONTROL_JOB = { start: "start", purge: "purge" } as const;
/** Message queue: one `send` job per recipient, rate-limited globally. */
export const BROADCAST_MESSAGE_QUEUE = QUEUE_NAMES.broadcastMessages;

/** Data of both control jobs (`purge` only uses `broadcastId`). */
export interface StartBroadcastJob {
  broadcastId: string;
  /** Snapshot progress, persisted so a retried job resumes instead of re-enqueuing. */
  cursor?: string;
  enqueued?: number;
}

export interface SendBroadcastMessageJob {
  broadcastId: string;
  userId: string;
  /** Telegram chat ID as a string (BigInt-safe JSON). */
  chatId: string;
}

/** Recipients enqueued per `addBulk` call. */
export const SNAPSHOT_BATCH_SIZE = 500;
/** Attempts for transient failures (network, 5xx) before a message counts as failed. */
export const MESSAGE_ATTEMPTS = 3;

/**
 * Even pacing: at most one message per `1000 / rate` ms. Unlike `{ max: rate,
 * duration: 1000 }`, this never bursts, so no 1-second window — sliding or not —
 * sees more than `rate` messages.
 */
export function messageLimiter(ratePerSecond: number): { max: number; duration: number } {
  return { max: 1, duration: Math.ceil(1000 / ratePerSecond) };
}

/** One message job per broadcast and user: a retried snapshot never duplicates a message. */
export function messageJobId(broadcastId: string, userId: string): string {
  return `${broadcastId}-${userId}`;
}
