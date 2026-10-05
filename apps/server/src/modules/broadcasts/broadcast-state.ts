import { ConflictException } from "@nestjs/common";
import type { BroadcastStatus } from "@tgstack/db";

/**
 * Allowed status changes:
 *
 *     DRAFT ──start──▶ QUEUED ──snapshot──▶ RUNNING ──all handled──▶ COMPLETED
 *       │                │                     │
 *       └────cancel──────┴────────cancel───────┴──▶ CANCELLED
 *                        └──snapshot failed──▶ FAILED
 */
const TRANSITIONS: Record<BroadcastStatus, readonly BroadcastStatus[]> = {
  DRAFT: ["QUEUED", "CANCELLED"],
  QUEUED: ["RUNNING", "CANCELLED", "FAILED"],
  RUNNING: ["COMPLETED", "CANCELLED", "FAILED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
};

export type BroadcastAction = "edit" | "start" | "cancel";

const ACTION_TARGET: Record<BroadcastAction, BroadcastStatus | null> = {
  edit: null,
  start: "QUEUED",
  cancel: "CANCELLED",
};

export function canTransition(from: BroadcastStatus, to: BroadcastStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses from which `action` is allowed. */
export function allowedFrom(action: BroadcastAction): BroadcastStatus[] {
  if (action === "edit") return ["DRAFT"];
  const target = ACTION_TARGET[action];
  return (Object.keys(TRANSITIONS) as BroadcastStatus[]).filter(
    (status) => target !== null && canTransition(status, target),
  );
}

/** Throws `409 Conflict` with a readable message when `action` is not allowed in `status`. */
export function assertAction(status: BroadcastStatus, action: BroadcastAction): void {
  if (!allowedFrom(action).includes(status)) {
    throw new ConflictException(`Cannot ${action} a ${status.toLowerCase()} broadcast`);
  }
}

export function isTerminal(status: BroadcastStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
