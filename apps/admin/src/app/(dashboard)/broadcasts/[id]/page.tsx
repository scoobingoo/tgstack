"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClockIcon, PlayIcon, SquareIcon, Undo2Icon } from "lucide-react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { BroadcastStatusBadge } from "@/components/badges";
import { AudienceEstimate, describeSegment } from "@/components/broadcasts/audience-picker";
import { BroadcastProgressBar } from "@/components/broadcasts/broadcast-progress";
import { BroadcastComposer } from "@/components/broadcasts/composer";
import { ScheduleDialog } from "@/components/broadcasts/schedule-dialog";
import { TelegramPreview } from "@/components/broadcasts/telegram-preview";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBroadcastProgress } from "@/hooks/use-broadcast-progress";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function BroadcastPage() {
  const { t, locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const broadcast = useQuery({
    queryKey: ["broadcasts", id],
    queryFn: () => api.broadcasts.get(id),
  });
  const { progress, live } = useBroadcastProgress(id, broadcast.data);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
  const onError = (error: Error) => toast.error(error.message);
  const start = useMutation({
    mutationFn: () => api.broadcasts.start(id),
    onSuccess: refresh,
    onError,
  });
  const cancel = useMutation({
    mutationFn: () => api.broadcasts.cancel(id),
    onSuccess: refresh,
    onError,
  });
  const unschedule = useMutation({
    mutationFn: () => api.broadcasts.unschedule(id),
    onSuccess: refresh,
    onError,
  });
  const schedule = useMutation({
    mutationFn: (scheduledAt: string) => api.broadcasts.schedule(id, scheduledAt),
    onSuccess: (next) => {
      toast.success(t("scheduled-for", { date: formatDateTime(next.scheduledAt, locale) }));
      void refresh();
    },
    onError,
  });

  if (broadcast.error)
    return <ErrorState error={broadcast.error} onRetry={() => broadcast.refetch()} />;
  const data = broadcast.data;
  if (!data) return <Skeleton className="h-96 w-full" />;

  const status = progress?.status ?? data.status;
  const scheduledAt = progress?.scheduledAt ?? data.scheduledAt;
  const canStart = status === "DRAFT" || status === "SCHEDULED";
  const canCancel = canStart || status === "QUEUED" || status === "RUNNING";
  const started = !canStart;

  const startButton = (
    <ConfirmDialog
      trigger={
        <Button variant={status === "SCHEDULED" ? "outline" : "default"} disabled={start.isPending}>
          <PlayIcon aria-hidden />
          {t(status === "SCHEDULED" ? "schedule-send-now" : "composer-start")}
        </Button>
      }
      title={t("composer-start-confirm-title")}
      description={
        <span className="space-y-2">
          <span className="block">{t("composer-start-confirm")}</span>
          <AudienceEstimate segment={data.segment} />
        </span>
      }
      confirmLabel={t("composer-start")}
      onConfirm={() => start.mutate()}
    />
  );

  return (
    <>
      <PageHeader
        title={t("broadcast-edit-title")}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <BroadcastStatusBadge status={status} />
            <span>
              {data.author.firstName} · {formatDateTime(data.createdAt, locale)}
            </span>
          </span>
        }
        actions={
          <>
            {canStart ? (
              <ScheduleDialog
                current={status === "SCHEDULED" ? scheduledAt : null}
                pending={schedule.isPending}
                onSchedule={(at) => schedule.mutateAsync(at)}
                trigger={
                  <Button variant={status === "SCHEDULED" ? "outline" : "secondary"}>
                    <CalendarClockIcon aria-hidden />
                    {t(status === "SCHEDULED" ? "schedule-reschedule" : "schedule-button")}
                  </Button>
                }
              />
            ) : null}
            {status === "SCHEDULED" ? (
              <Button
                variant="outline"
                disabled={unschedule.isPending}
                onClick={() => unschedule.mutate()}
              >
                <Undo2Icon aria-hidden />
                {t("schedule-unschedule")}
              </Button>
            ) : null}
            {canStart ? startButton : null}
            {canCancel ? (
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" disabled={cancel.isPending}>
                    <SquareIcon aria-hidden />
                    {t("composer-cancel-broadcast")}
                  </Button>
                }
                title={t("composer-cancel-confirm-title")}
                description={t("composer-cancel-confirm")}
                confirmLabel={t("composer-cancel-broadcast")}
                destructive
                onConfirm={() => cancel.mutate()}
              />
            ) : null}
          </>
        }
      />

      {status === "SCHEDULED" && scheduledAt ? (
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <CalendarClockIcon className="size-5 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">
                {t("scheduled-for", { date: formatDateTime(scheduledAt, locale) })}
              </p>
              <p className="text-sm text-muted-foreground">{t("scheduled-help")}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {started && progress ? (
        <Card>
          <CardContent className="pt-6">
            <BroadcastProgressBar progress={progress} live={live} />
          </CardContent>
        </Card>
      ) : null}

      {data.status === "DRAFT" && status === "DRAFT" ? (
        <BroadcastComposer key={data.id} broadcast={data} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t("composer-preview")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(status === "SCHEDULED" ? "composer-read-only-scheduled" : "composer-read-only")}
              </p>
              <TelegramPreview
                text={data.text}
                imageUrl={data.imageUrl}
                buttonText={data.buttonText}
                buttonUrl={data.buttonUrl}
              />
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>
                <h2>{t("audience-title")}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="list-inside list-disc text-sm">
                {describeSegment(data.segment, t).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {status === "SCHEDULED" ? <AudienceEstimate segment={data.segment} /> : null}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
