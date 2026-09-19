"use client";

import { type ColumnDef, type RowData, tableFeatures, useTable } from "@tanstack/react-table";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useI18n } from "@/lib/i18n";

export const tableCoreFeatures = tableFeatures({});
export type CoreFeatures = typeof tableCoreFeatures;
// biome-ignore lint/suspicious/noExplicitAny: columns of one table have different value types
export type Columns<TData extends RowData> = ColumnDef<CoreFeatures, TData, any>[];

interface DataTableProps<TData extends RowData> {
  columns: Columns<TData>;
  data: TData[] | undefined;
  isLoading?: boolean;
  /** Accessible table name. */
  label: string;
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
}

const emptyRows: never[] = [];

/**
 * Server-paginated tables: TanStack Table builds rows and cells, the server
 * already filtered and paginated the data (see {@link Pagination}).
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  isLoading,
  label,
  getRowId,
  onRowClick,
}: DataTableProps<TData>) {
  const { t } = useI18n();
  const table = useTable({
    features: tableCoreFeatures,
    columns,
    data: data ?? (emptyRows as TData[]),
    ...(getRowId ? { getRowId } : {}),
  });

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table aria-label={label}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} scope="col">
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading && !data
            ? Array.from({ length: 5 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                <TableRow key={i}>
                  {columns.map((_column, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : null}
          {!isLoading && table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                {t("empty")}
              </TableCell>
            </TableRow>
          ) : null}
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={onRowClick ? "cursor-pointer" : undefined}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const lastPage = Math.max(1, Math.ceil(total / limit));
  return (
    <nav className="flex items-center justify-between gap-2 text-sm" aria-label="Pagination">
      <p className="text-muted-foreground">{t("pagination-summary", { from, to, total })}</p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon aria-hidden />
          {t("pagination-previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          {t("pagination-next")}
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
