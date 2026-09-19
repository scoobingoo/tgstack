"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayIcon, SquareIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { BroadcastStatusBadge } from "@/components/badges";
import { BroadcastProgressBar } from "@/components/broadcasts/broadcast-progress";
import { BroadcastComposer } from "@/components/broadcasts/composer";
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
  const start = useMutation({
    mutationFn: () => api.broadcasts.start(id),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });
  const cancel = useMutation({
    mutationFn: () => api.broadcasts.cancel(id),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  if (broadcast.error)
    return <ErrorState error={broadcast.error} onRetry={() => broadcast.refetch()} />;
  const data = broadcast.data;
  if (!data) return <Skeleton className="h-96 w-full" />;

  const status = progress?.status ?? data.status;
  const canCancel = status === "DRAFT" || status === "QUEUED" || status === "RUNNING";

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
            {status === "DRAFT" ? (
              <ConfirmDialog
                trigger={
                  <Button disabled={start.isPending}>
                    <PlayIcon aria-hidden />
                    {t("composer-start")}
                  </Button>
                }
                title={t("composer-start-confirm-title")}
                description={t("composer-start-confirm")}
                confirmLabel={t("composer-start")}
                onConfirm={() => start.mutate()}
              />
            ) : null}
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

      {status !== "DRAFT" && progress ? (
        <Card>
          <CardContent className="pt-6">
            <BroadcastProgressBar progress={progress} live={live} />
          </CardContent>
        </Card>
      ) : null}

      {data.status === "DRAFT" && status === "DRAFT" ? (
        <BroadcastComposer key={data.id} broadcast={data} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("composer-preview")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("composer-read-only")}</p>
            <TelegramPreview
              text={data.text}
              imageUrl={data.imageUrl}
              buttonText={data.buttonText}
              buttonUrl={data.buttonUrl}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
