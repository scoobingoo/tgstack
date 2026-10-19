"use client";

import type { BroadcastStatus, PaymentStatus, Role } from "@tgstack/shared";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";

const BROADCAST_VARIANT: Record<
  BroadcastStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "outline",
  SCHEDULED: "secondary",
  QUEUED: "secondary",
  RUNNING: "default",
  COMPLETED: "secondary",
  CANCELLED: "outline",
  FAILED: "destructive",
};

export function BroadcastStatusBadge({ status }: { status: BroadcastStatus }) {
  const t = useT();
  return <Badge variant={BROADCAST_VARIANT[status]}>{t(`broadcast-status-${status}`)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useT();
  return (
    <Badge variant={status === "PAID" ? "secondary" : "outline"}>
      {t(`payment-status-${status}`)}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  return <Badge variant={role === "ADMIN" ? "default" : "outline"}>{t(`role-${role}`)}</Badge>;
}

export function BlockedBadge({ blocked }: { blocked: boolean }) {
  const t = useT();
  return (
    <Badge variant={blocked ? "destructive" : "secondary"}>
      {t(blocked ? "status-blocked" : "status-active")}
    </Badge>
  );
}
