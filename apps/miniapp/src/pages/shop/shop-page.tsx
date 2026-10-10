// EXAMPLE: shop — product list → product → pay with Telegram Stars.
// Delete this folder and its tab in src/app/App.tsx to remove it (docs/examples.md).
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProductDto } from "@tgstack/shared";
import { invoice } from "@tma.js/sdk-react";
import { ChevronRightIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../app/app-context";
import { ErrorView, Section, Spinner, Toast } from "../../components/ui";
import { useBackButton, useMainButton } from "../../hooks/use-telegram-buttons";

type InvoiceOutcome = "paid" | "cancelled" | "failed" | "pending";

function ProductView({ product, onBack }: { product: ProductDto; onBack: () => void }) {
  const { api, t } = useApp();
  const [outcome, setOutcome] = useState<InvoiceOutcome | null>(null);

  const buy = useMutation({
    mutationFn: async () => {
      const { url } = await api.createInvoice(product.id);
      // Opens Telegram's native payment sheet; resolves with the invoice status.
      return (await invoice.openUrl(url)) as InvoiceOutcome;
    },
    onSuccess: setOutcome,
    onError: () => setOutcome("failed"),
  });

  useBackButton(onBack);
  useMainButton({
    text: t("buy-for", { price: product.priceStars }),
    onClick: () => buy.mutate(),
    loading: buy.isPending,
  });

  return (
    <div className="space-y-4">
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt=""
          className="aspect-video w-full rounded-xl object-cover"
        />
      ) : null}
      <div className="space-y-1 px-1">
        <h1 className="text-xl font-semibold">{product.title}</h1>
        <p className="flex items-center gap-1 text-tg-accent">
          <StarIcon className="size-4 fill-current" aria-hidden />
          <span className="font-medium">{product.priceStars}</span>
        </p>
      </div>
      <Section>
        <p className="px-4 py-3">{product.description}</p>
      </Section>
      {outcome ? (
        <Toast tone={outcome === "failed" ? "error" : "info"}>{t(`invoice-${outcome}`)}</Toast>
      ) : null}
    </div>
  );
}

export function ShopPage() {
  const { api, t } = useApp();
  const [selected, setSelected] = useState<ProductDto | null>(null);
  const products = useQuery({ queryKey: ["products"], queryFn: api.products });

  if (selected) return <ProductView product={selected} onBack={() => setSelected(null)} />;
  if (products.isLoading) return <Spinner label={t("loading")} />;
  if (products.error || !products.data) {
    return (
      <ErrorView
        message={t("error-generic")}
        retryLabel={t("retry")}
        onRetry={() => products.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-1 pt-2">
        <h1 className="text-xl font-semibold">{t("shop-title")}</h1>
        <p className="text-sm text-tg-hint">{t("shop-subtitle")}</p>
      </div>
      {products.data.length === 0 ? (
        <p className="p-8 text-center text-tg-hint">{t("shop-empty")}</p>
      ) : (
        <Section>
          <ul className="divide-y divide-tg-separator">
            {products.data.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  aria-label={`${product.title}, ${product.priceStars} ⭐`}
                  onClick={() => setSelected(product)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-tg-secondary"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{product.title}</span>
                    <span className="block truncate text-sm text-tg-hint">
                      {product.description}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-tg-accent">
                    <StarIcon className="size-4 fill-current" aria-hidden />
                    {product.priceStars}
                  </span>
                  <ChevronRightIcon className="size-4 text-tg-hint" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
