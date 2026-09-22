"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PaymentDto, PaymentStatus } from "@tgstack/shared";
import { Undo2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PaymentStatusBadge } from "@/components/badges";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { type Columns, DataTable, Pagination } from "@/components/data-table";
import { ErrorState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { displayName, formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const LIMIT = 20;
const ALL = "all";

export default function PaymentsPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>(ALL);
  const query = {
    page,
    limit: LIMIT,
    status: status === ALL ? undefined : (status as PaymentStatus),
  };
  const payments = useQuery({
    queryKey: ["payments", query],
    queryFn: () => api.payments.list(query),
    placeholderData: keepPreviousData,
  });
  const refund = useMutation({
    mutationFn: (id: string) => api.payments.refund(id),
    onSuccess: () => {
      toast.success(t("payment-refunded"));
      void queryClient.invalidateQueries({ queryKey: ["payments"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const columns: Columns<PaymentDto> = [
    {
      id: "user",
      header: t("col-user"),
      cell: ({ row }) => (
        <div>
          <p>{displayName(row.original.user)}</p>
          <p className="font-mono text-xs text-muted-foreground">{row.original.user.telegramId}</p>
        </div>
      ),
    },
    {
      id: "product",
      header: t("col-product"),
      cell: ({ row }) => row.original.product?.title ?? "—",
    },
    {
      id: "amount",
      header: t("col-amount"),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatNumber(row.original.amount, locale)}{" "}
          {row.original.currency === "XTR" ? "⭐" : row.original.currency}
        </span>
      ),
    },
    {
      id: "status",
      header: t("col-status"),
      cell: ({ row }) => <PaymentStatusBadge status={row.original.status} />,
    },
    {
      id: "date",
      header: t("col-date"),
      cell: ({ row }) => formatDateTime(row.original.createdAt, locale),
    },
    {
      id: "charge",
      header: t("col-charge"),
      cell: ({ row }) => (
        <span
          className="block max-w-36 truncate font-mono text-xs"
          title={row.original.telegramPaymentChargeId}
        >
          {row.original.telegramPaymentChargeId}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{t("payment-refund")}</span>,
      cell: ({ row }) =>
        row.original.status === "PAID" ? (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={refund.isPending}>
                <Undo2Icon aria-hidden />
                {t("payment-refund")}
              </Button>
            }
            title={t("payment-refund-title", {
              amount: row.original.amount,
              name: row.original.user.firstName,
            })}
            description={t("payment-refund-confirm")}
            confirmLabel={t("payment-refund")}
            destructive
            onConfirm={() => refund.mutate(row.original.id)}
          />
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title={t("payments-title")} />
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-48" aria-label={t("col-status")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>
            {t("col-status")}: {t("all")}
          </SelectItem>
          <SelectItem value="PAID">{t("payment-status-PAID")}</SelectItem>
          <SelectItem value="REFUNDED">{t("payment-status-REFUNDED")}</SelectItem>
        </SelectContent>
      </Select>
      {payments.error ? (
        <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
      ) : null}
      <DataTable
        label={t("payments-title")}
        columns={columns}
        data={payments.data?.items}
        isLoading={payments.isLoading}
        getRowId={(row) => row.id}
      />
      {payments.data ? (
        <Pagination page={page} limit={LIMIT} total={payments.data.total} onPageChange={setPage} />
      ) : null}
    </>
  );
}
