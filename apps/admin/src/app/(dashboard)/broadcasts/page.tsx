"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { BroadcastDto } from "@tgstack/shared";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BroadcastStatusBadge } from "@/components/badges";
import { type Columns, DataTable, Pagination } from "@/components/data-table";
import { ErrorState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const LIMIT = 20;

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function BroadcastsPage() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const broadcasts = useQuery({
    queryKey: ["broadcasts", { page, limit: LIMIT }],
    queryFn: () => api.broadcasts.list({ page, limit: LIMIT }),
    placeholderData: keepPreviousData,
    // Keep the list fresh while something is being sent.
    refetchInterval: (query) =>
      query.state.data?.items.some((b) => b.status === "QUEUED" || b.status === "RUNNING")
        ? 3_000
        : false,
  });

  const columns: Columns<BroadcastDto> = [
    {
      id: "message",
      header: t("col-message"),
      cell: ({ row }) => (
        <Link
          href={`/broadcasts/${row.original.id}`}
          className="line-clamp-2 max-w-md font-medium hover:underline"
        >
          {plainText(row.original.text) || "—"}
        </Link>
      ),
    },
    {
      id: "status",
      header: t("col-status"),
      cell: ({ row }) => <BroadcastStatusBadge status={row.original.status} />,
    },
    {
      id: "progress",
      header: t("col-progress"),
      cell: ({ row }) => {
        const { sent, failed, total } = row.original;
        if (total === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex min-w-36 items-center gap-2">
            <Progress value={((sent + failed) / total) * 100} aria-label={t("col-progress")} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatNumber(sent + failed, locale)}/{formatNumber(total, locale)}
            </span>
          </div>
        );
      },
    },
    { id: "author", header: t("col-author"), cell: ({ row }) => row.original.author.firstName },
    {
      id: "created",
      header: t("col-created"),
      cell: ({ row }) => formatDateTime(row.original.createdAt, locale),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("broadcasts-title")}
        actions={
          <Button asChild>
            <Link href="/broadcasts/new">
              <PlusIcon aria-hidden />
              {t("broadcasts-new")}
            </Link>
          </Button>
        }
      />
      {broadcasts.error ? (
        <ErrorState error={broadcasts.error} onRetry={() => broadcasts.refetch()} />
      ) : null}
      <DataTable
        label={t("broadcasts-title")}
        columns={columns}
        data={broadcasts.data?.items}
        isLoading={broadcasts.isLoading}
        getRowId={(row) => row.id}
      />
      {broadcasts.data ? (
        <Pagination
          page={page}
          limit={LIMIT}
          total={broadcasts.data.total}
          onPageChange={setPage}
        />
      ) : null}
    </>
  );
}
