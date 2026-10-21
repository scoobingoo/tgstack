// EXAMPLE: shop — product list → product → pay with Telegram Stars or by bank transfer (PayOS).
// Delete this folder and its tab in src/app/App.tsx to remove it (docs/examples.md).
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CheckoutDto, ProductDto } from "@tgstack/shared";
import { invoice, openLink } from "@tma.js/sdk-react";
import { ChevronRightIcon, ExternalLinkIcon, LandmarkIcon, StarIcon } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../app/app-context";
import { ErrorView, Section, Spinner, Toast } from "../../components/ui";
import { useBackButton, useMainButton } from "../../hooks/use-telegram-buttons";

type InvoiceOutcome = "paid" | "cancelled" | "failed" | "pending";

const formatVnd = (amount: number) => `${new Intl.NumberFormat("vi-VN").format(amount)} ₫`;

/**
 * Bank transfer through PayOS: create the order, then open its checkout page (a
 * VietQR code) on a second tap — Telegram only opens links from a user gesture.
 * The order is polled until the PayOS webhook marks it paid.
 */
function BankTransfer({ product }: { product: ProductDto & { priceVnd: number } }) {
  const { api, t } = useApp();
  const [order, setOrder] = useState<CheckoutDto | null>(null);
  const create = useMutation({
    mutationFn: () => api.checkout(product.id),
    onSuccess: setOrder,
  });
  const status = useQuery({
    queryKey: ["payment-order", order?.orderCode],
    queryFn: () => api.paymentOrder(order?.orderCode ?? 0),
    enabled: order !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" || !query.state.data ? 3_000 : false,
  });
  const state = status.data?.status;

  return (
    <Section>
      <div className="space-y-3 px-4 py-3">
        <p className="flex items-center gap-2 font-medium">
          <LandmarkIcon className="size-4 text-tg-accent" aria-hidden />
          {t("bank-title", { price: formatVnd(product.priceVnd) })}
        </p>
        {!order ? (
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
            className="w-full rounded-lg bg-tg-secondary px-4 py-2 font-medium text-tg-link disabled:opacity-60"
          >
            {create.isPending ? t("loading") : t("bank-start")}
          </button>
        ) : state === "PAID" ? (
          <Toast tone="info">{t("bank-paid")}</Toast>
        ) : state === "EXPIRED" || state === "CANCELLED" ? (
          <Toast tone="error">{t("bank-expired")}</Toast>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openLink(order.url)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-tg-button px-4 py-2 font-medium text-tg-button-text"
            >
              {t("bank-open")}
              <ExternalLinkIcon className="size-4" aria-hidden />
            </button>
            <p className="text-sm text-tg-hint" aria-live="polite">
              {t("bank-waiting")}
            </p>
          </>
        )}
        {create.isError ? <Toast tone="error">{t("bank-error")}</Toast> : null}
      </div>
    </Section>
  );
}

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
      {product.priceVnd ? (
        <BankTransfer product={{ ...product, priceVnd: product.priceVnd }} />
      ) : null}
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
