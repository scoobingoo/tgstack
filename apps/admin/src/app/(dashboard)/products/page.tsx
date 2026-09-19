"use client";

// EXAMPLE: shop catalogue management. Delete this page and the sidebar entry to remove it.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CreateProductBody, createProductSchema, type ProductDto } from "@tgstack/shared";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { type Columns, DataTable, Pagination } from "@/components/data-table";
import { ErrorState, PageHeader } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const LIMIT = 20;

interface FormState {
  title: string;
  description: string;
  priceStars: string;
  imageUrl: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  title: "",
  description: "",
  priceStars: "",
  imageUrl: "",
  isActive: true,
};

function ProductDialog({
  product,
  open,
  onOpenChange,
}: {
  product: ProductDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastProduct, setLastProduct] = useState<ProductDto | null | undefined>(undefined);

  // Reset the form whenever the dialog opens for another product.
  if (open && lastProduct !== product) {
    setLastProduct(product);
    setErrors({});
    setForm(
      product
        ? {
            title: product.title,
            description: product.description,
            priceStars: String(product.priceStars),
            imageUrl: product.imageUrl ?? "",
            isActive: product.isActive,
          }
        : emptyForm,
    );
  }

  const save = useMutation({
    mutationFn: async () => {
      const body: CreateProductBody = {
        title: form.title,
        description: form.description,
        priceStars: Number(form.priceStars),
        imageUrl: form.imageUrl.trim() || null,
        isActive: form.isActive,
      };
      const parsed = createProductSchema.safeParse(body);
      if (!parsed.success) {
        setErrors(
          Object.fromEntries(
            parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
          ),
        );
        throw new Error(parsed.error.issues[0]?.message ?? "Invalid");
      }
      return product ? api.products.update(product.id, body) : api.products.create(body);
    },
    onSuccess: () => {
      toast.success(t("product-saved"));
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const field = (name: keyof FormState, label: string, input: React.ReactNode) => (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {input}
      {errors[name] ? <p className="text-xs text-destructive">{errors[name]}</p> : null}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{product ? t("product-edit") : t("products-new")}</DialogTitle>
            <DialogDescription className="sr-only">{t("products-title")}</DialogDescription>
          </DialogHeader>
          {field(
            "title",
            t("field-title"),
            <Input
              id="title"
              maxLength={32}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />,
          )}
          {field(
            "description",
            t("field-description"),
            <Textarea
              id="description"
              maxLength={255}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />,
          )}
          {field(
            "priceStars",
            t("field-price"),
            <Input
              id="priceStars"
              type="number"
              min={1}
              inputMode="numeric"
              value={form.priceStars}
              onChange={(e) => setForm({ ...form, priceStars: e.target.value })}
            />,
          )}
          {field(
            "imageUrl",
            t("field-image"),
            <Input
              id="imageUrl"
              type="url"
              placeholder="https://"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            />,
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="isActive">{t("field-active")}</Label>
            <Switch
              id="isActive"
              checked={form.isActive}
              onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("action-cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {t("action-save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductsPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const products = useQuery({
    queryKey: ["products", { page, limit: LIMIT }],
    queryFn: () => api.products.list({ page, limit: LIMIT, includeInactive: true }),
    placeholderData: keepPreviousData,
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.products.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
    onError: (error) => toast.error(error.message),
  });

  const open = (product: ProductDto | null) => {
    setEditing(product);
    setDialogOpen(true);
  };

  const columns: Columns<ProductDto> = [
    {
      id: "title",
      header: t("col-title"),
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.title}</p>
          <p className="line-clamp-1 text-xs text-muted-foreground">{row.original.description}</p>
        </div>
      ),
    },
    {
      id: "price",
      header: t("col-price"),
      cell: ({ row }) => `${formatNumber(row.original.priceStars, locale)} ⭐`,
    },
    {
      id: "active",
      header: t("col-active"),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "secondary" : "outline"}>
          {row.original.isActive ? t("field-active") : "—"}
        </Badge>
      ),
    },
    {
      id: "created",
      header: t("col-created"),
      cell: ({ row }) => formatDate(row.original.createdAt, locale),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">{t("action-edit")}</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => open(row.original)}>
            <PencilIcon aria-hidden />
            {t("action-edit")}
          </Button>
          {row.original.isActive ? (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  {t("product-deactivate")}
                </Button>
              }
              title={`${t("product-deactivate")}: ${row.original.title}`}
              description={t("product-deactivate-confirm")}
              confirmLabel={t("product-deactivate")}
              destructive
              onConfirm={() => deactivate.mutate(row.original.id)}
            />
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("products-title")}
        actions={
          <Button onClick={() => open(null)}>
            <PlusIcon aria-hidden />
            {t("products-new")}
          </Button>
        }
      />
      {products.error ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : null}
      <DataTable
        label={t("products-title")}
        columns={columns}
        data={products.data?.items}
        isLoading={products.isLoading}
        getRowId={(row) => row.id}
      />
      {products.data ? (
        <Pagination page={page} limit={LIMIT} total={products.data.total} onPageChange={setPage} />
      ) : null}
      <ProductDialog product={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
