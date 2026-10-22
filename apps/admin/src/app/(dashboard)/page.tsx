"use client";

import { useQuery } from "@tanstack/react-query";
import type { PaymentDto } from "@tgstack/shared";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { PaymentStatusBadge } from "@/components/badges";
import { type Columns, DataTable } from "@/components/data-table";
import { ErrorState, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { displayName, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

function StatCard({ label, value }: { label: string; value: string | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {value ?? <Skeleton className="h-9 w-20" />}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

export default function DashboardPage() {
  const { t, locale } = useI18n();
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 60_000 });
  const payments = useQuery({
    queryKey: ["payments", { page: 1, limit: 5 }],
    queryFn: () => api.payments.list({ page: 1, limit: 5 }),
  });

  const n = (value: number | undefined) =>
    value === undefined ? undefined : formatNumber(value, locale);
  const s = stats.data;
  const chartConfig = {
    count: { label: t("chart-users"), color: "var(--chart-1)" },
  } satisfies ChartConfig;

  const paymentColumns: Columns<PaymentDto> = [
    { id: "user", header: t("col-user"), cell: ({ row }) => displayName(row.original.user) },
    {
      id: "product",
      header: t("col-product"),
      cell: ({ row }) => row.original.product?.title ?? "—",
    },
    {
      id: "amount",
      header: t("col-amount"),
      cell: ({ row }) => `${formatNumber(row.original.amount, locale)} ⭐`,
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
  ];

  return (
    <>
      <PageHeader title={t("dashboard-title")} />
      {stats.error ? <ErrorState error={stats.error} onRetry={() => stats.refetch()} /> : null}

      <section
        aria-label={t("dashboard-title")}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard label={t("stat-total-users")} value={n(s?.totalUsers)} />
        <StatCard label={t("stat-new-7d")} value={n(s?.newUsers.last7Days)} />
        <StatCard label={t("stat-active-7d")} value={n(s?.activeUsers7d)} />
        <StatCard
          label={t("stat-revenue")}
          value={
            s
              ? t("stat-revenue-value", { amount: formatNumber(s.revenueStars, locale) })
              : undefined
          }
        />
        <StatCard label={t("stat-new-today")} value={n(s?.newUsers.today)} />
        <StatCard label={t("stat-new-30d")} value={n(s?.newUsers.last30Days)} />
        <StatCard label={t("stat-blocked")} value={n(s?.blockedUsers)} />
        <StatCard
          label={t("stat-revenue-vnd")}
          value={s ? formatMoney(s.revenueVnd, "VND", locale) : undefined}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("chart-new-users")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {s ? (
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <BarChart data={s.dailyNewUsers} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="recent-payments">
        <div className="flex items-center justify-between">
          <h2 id="recent-payments" className="text-lg font-semibold">
            {t("recent-payments")}
          </h2>
          <Button asChild variant="link" size="sm">
            <Link href="/payments">{t("view-all")}</Link>
          </Button>
        </div>
        <DataTable
          label={t("recent-payments")}
          columns={paymentColumns}
          data={payments.data?.items}
          isLoading={payments.isLoading}
          getRowId={(row) => row.id}
        />
      </section>
    </>
  );
}
