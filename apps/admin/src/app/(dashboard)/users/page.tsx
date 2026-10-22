"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role, UserDto } from "@tgstack/shared";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BlockedBadge, PaymentStatusBadge, RoleBadge } from "@/components/badges";
import { type Columns, DataTable, Pagination } from "@/components/data-table";
import { ErrorState, PageHeader } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api } from "@/lib/api";
import { displayName, formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const LIMIT = 20;
const ALL = "all";

function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["users", userId],
    queryFn: () => api.users.get(userId as string),
    enabled: userId !== null,
  });
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: api.auth.me, staleTime: 60_000 });
  const setRole = useMutation({
    mutationFn: (role: Role) => api.users.setRole(userId as string, role),
    onSuccess: () => {
      toast.success(t("user-role-updated"));
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const user = detail.data;

  return (
    <Sheet open={userId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{user ? displayName(user) : t("user-details")}</SheetTitle>
          <SheetDescription>
            {user ? `Telegram ID ${user.telegramId}` : t("loading")}
          </SheetDescription>
        </SheetHeader>
        {detail.error ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : null}
        {user ? (
          <div className="space-y-6 px-4 pb-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">{t("col-role")}</dt>
              <dd>
                <RoleBadge role={user.role} />
              </dd>
              <dt className="text-muted-foreground">{t("col-status")}</dt>
              <dd>
                <BlockedBadge blocked={user.isBlocked} />
              </dd>
              <dt className="text-muted-foreground">{t("col-locale")}</dt>
              <dd className="uppercase">{user.locale}</dd>
              <dt className="text-muted-foreground">{t("col-joined")}</dt>
              <dd>{formatDateTime(user.createdAt, locale)}</dd>
              <dt className="text-muted-foreground">{t("col-last-seen")}</dt>
              <dd>{formatDateTime(user.lastSeenAt, locale)}</dd>
              <dt className="text-muted-foreground">{t("user-spent")}</dt>
              <dd>{formatNumber(user.totalSpentStars, locale)} ⭐</dd>
            </dl>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="admin-access">{t("user-make-admin")}</Label>
              <Switch
                id="admin-access"
                checked={user.role === "ADMIN"}
                disabled={setRole.isPending || me.data?.user.id === user.id}
                onCheckedChange={(checked) => setRole.mutate(checked ? "ADMIN" : "USER")}
              />
            </div>

            {user.onboarding ? (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("user-onboarding")}</h3>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(user.onboarding, null, 2)}
                </pre>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-sm font-medium">
                {t("user-payments")} ({user.paymentsCount})
              </h3>
              {user.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <ul className="divide-y rounded-lg border text-sm">
                  {user.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-2 p-3">
                      <div>
                        <p>{payment.product?.title ?? payment.provider}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(payment.createdAt, locale)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">
                          {formatMoney(payment.amount, payment.currency, locale)}
                        </span>
                        <PaymentStatusBadge status={payment.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : detail.isLoading ? (
          <div className="space-y-3 px-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function UsersPage() {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>(ALL);
  const [blocked, setBlocked] = useState<string>(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());

  const query = {
    page,
    limit: LIMIT,
    search: debouncedSearch || undefined,
    role: role === ALL ? undefined : (role as Role),
    blocked: blocked === ALL ? undefined : blocked === "true",
  };
  const users = useQuery({
    queryKey: ["users", query],
    queryFn: () => api.users.list(query),
    placeholderData: keepPreviousData,
  });

  const columns: Columns<UserDto> = [
    {
      id: "user",
      header: t("col-user"),
      cell: ({ row }) => (
        <div>
          {/* A real button keeps the drawer reachable from the keyboard. */}
          <button
            type="button"
            className="text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
            onClick={(event) => {
              event.stopPropagation();
              setSelected(row.original.id);
            }}
          >
            {[row.original.firstName, row.original.lastName].filter(Boolean).join(" ")}
          </button>
          {row.original.username ? (
            <p className="text-xs text-muted-foreground">@{row.original.username}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "telegramId",
      header: t("col-telegram-id"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.telegramId}</span>,
    },
    { id: "locale", header: t("col-locale"), cell: ({ row }) => row.original.locale.toUpperCase() },
    {
      id: "role",
      header: t("col-role"),
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      id: "status",
      header: t("col-status"),
      cell: ({ row }) => <BlockedBadge blocked={row.original.isBlocked} />,
    },
    {
      id: "joined",
      header: t("col-joined"),
      cell: ({ row }) => formatDate(row.original.createdAt, locale),
    },
    {
      id: "seen",
      header: t("col-last-seen"),
      cell: ({ row }) => formatDateTime(row.original.lastSeenAt, locale),
    },
  ];

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <>
      <PageHeader title={t("users-title")} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon
            className="absolute top-2.5 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label={t("users-search-placeholder")}
            placeholder={t("users-search-placeholder")}
            className="pl-8"
            value={search}
            onChange={(event) => resetPage(setSearch)(event.target.value)}
          />
        </div>
        <Select value={role} onValueChange={resetPage(setRole)}>
          <SelectTrigger className="w-36" aria-label={t("users-filter-role")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              {t("users-filter-role")}: {t("all")}
            </SelectItem>
            <SelectItem value="ADMIN">{t("role-ADMIN")}</SelectItem>
            <SelectItem value="USER">{t("role-USER")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={blocked} onValueChange={resetPage(setBlocked)}>
          <SelectTrigger className="w-40" aria-label={t("users-filter-blocked")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              {t("users-filter-blocked")}: {t("all")}
            </SelectItem>
            <SelectItem value="false">{t("status-active")}</SelectItem>
            <SelectItem value="true">{t("status-blocked")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {users.error ? <ErrorState error={users.error} onRetry={() => users.refetch()} /> : null}
      <DataTable
        label={t("users-title")}
        columns={columns}
        data={users.data?.items}
        isLoading={users.isLoading}
        getRowId={(row) => row.id}
        onRowClick={(row) => setSelected(row.id)}
      />
      {users.data ? (
        <Pagination page={page} limit={LIMIT} total={users.data.total} onPageChange={setPage} />
      ) : null}
      <UserDrawer userId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
