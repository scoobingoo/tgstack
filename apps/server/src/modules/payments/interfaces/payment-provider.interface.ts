import type { Payment, User } from "@tgstack/db";

/** What is being sold. Providers turn it into an invoice. */
export interface InvoiceItem {
  /** Optional reference to a `Product` row. */
  productId: string | null;
  title: string;
  description: string;
  /** Price in the provider's smallest currency unit (Stars are whole units). */
  amount: number;
  photoUrl?: string | null;
}

export interface InvoiceRequest {
  user: User;
  item: InvoiceItem;
}

export type InvoiceTarget =
  /** A link the Mini App opens with `openInvoice()` (`createInvoiceLink`). */
  | { type: "link" }
  /** An invoice message sent to a chat (`sendInvoice`). */
  | { type: "chat"; chatId: number };

export type CreatedInvoice = { type: "link"; url: string } | { type: "chat"; messageId: number };

/** A checkout that is about to be charged (Telegram `pre_checkout_query`). */
export interface PreCheckoutRequest {
  id: string;
  fromTelegramId: bigint;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
}

/** Why a checkout was rejected; the bot translates it (`payment-error-<reason>` in bot.ftl). */
export type PreCheckoutRejection = "invalid" | "unavailable" | "price-changed";

export type PreCheckoutDecision = { ok: true } | { ok: false; reason: PreCheckoutRejection };

/** A completed payment reported by the provider (Telegram `successful_payment`). */
export interface SuccessfulPaymentRequest {
  fromTelegramId: bigint;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
  /** Unique charge ID used for idempotency and refunds. */
  chargeId: string;
}

export interface RecordedPayment {
  payment: Payment;
  /** `false` when the same charge was already recorded (duplicate delivery). */
  created: boolean;
}

/**
 * A payment method. Implement it to add a gateway (VietQR, PayOS, …) and register
 * the class in `PaymentsModule` — see docs/payments.md.
 */
export interface PaymentProvider {
  /** Stored in `Payment.provider`, e.g. `"telegram-stars"`. */
  readonly name: string;
  /** ISO 4217 code, or `"XTR"` for Telegram Stars. */
  readonly currency: string;

  createInvoice(request: InvoiceRequest, target: InvoiceTarget): Promise<CreatedInvoice>;
  /** Accept or reject a checkout. Must answer fast: Telegram waits about 10 seconds. */
  handlePreCheckout(request: PreCheckoutRequest): Promise<PreCheckoutDecision>;
  /** Records a successful payment. Must be idempotent per `chargeId`. */
  handleSuccess(request: SuccessfulPaymentRequest): Promise<RecordedPayment>;
  /** Returns the money to the user. The caller marks the payment as refunded. */
  refund(payment: Payment & { user: User }): Promise<void>;
}

/** Injection token for the list of registered providers. */
export const PAYMENT_PROVIDERS = Symbol("PAYMENT_PROVIDERS");
