"use client";

import type { BroadcastProgressDto } from "@tgstack/shared";
import { RadioIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function BroadcastProgressBar({
  progress,
  live,
}: {
  progress: BroadcastProgressDto;
  live?: boolean;
}) {
  const { t, locale } = useI18n();
  const done = progress.sent + progress.failed;
  const percent =
    progress.total === 0
      ? progress.status === "COMPLETED"
        ? 100
        : 0
      : (done / progress.total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>
          {t("progress-label", {
            done: formatNumber(done, locale),
            total: formatNumber(progress.total, locale),
          })}
        </span>
        {live ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <RadioIcon className="size-3 animate-pulse" aria-hidden />
            {t("progress-live")}
          </span>
        ) : null}
      </div>
      <Progress value={percent} aria-label={t("col-progress")} />
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>
          {t("progress-sent")}:{" "}
          <span className="tabular-nums">{formatNumber(progress.sent, locale)}</span>
        </span>
        <span>
          {t("progress-failed")}:{" "}
          <span className="tabular-nums">{formatNumber(progress.failed, locale)}</span>
        </span>
      </div>
    </div>
  );
}
