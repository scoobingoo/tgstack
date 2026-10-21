import { randomInt } from "node:crypto";
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { type Payment, type PaymentOrder, Prisma } from "@tgstack/db";
import { negotiateLocale } from "@tgstack/i18n";
import { InjectBot } from "@tgstack/nestjs-grammy";
import { escapeHtml } from "@tgstack/shared";
import type { Bot } from "grammy";
import type { BotContext } from "../../../../bot/bot.context.js";
import { BotI18n } from "../../../../bot/middlewares/i18n.middleware.js";
import { AppConfig } from "../../../../config/app-config.js";
import { PrismaService } from "../../../../infra/prisma/prisma.service.js";
import type {
  CreatedInvoice,
  InvoiceRequest,
  InvoiceTarget,
  PaymentProvider,
  PreCheckoutDecision,
  RecordedPayment,
  SuccessfulPaymentRequest,
} from "../../interfaces/payment-provider.interface.js";
import { PayOsClient } from "./payos.client.js";
import { payosVerify } from "./payos.signature.js";

export const PAYOS = "payos";
const VND = "VND";
/** PayOS `orderCode`s are integers; stay within Postgres `int4`. */
const MAX_ORDER_CODE = 2_147_483_647;

/** The payment data PayOS signs in webhooks (fields used here; others are signed too). */
interface PayOsWebhookData {
  orderCode: number;
  amount: number;
  currency?: string;
  /** `"00"` = paid. */
  code: string;
  reference?: string;
  paymentLinkId?: string;
  [key: string]: unknown;
}

export type WebhookOutcome = "recorded" | "duplicate" | "ignored";

/**
 * PayOS: Vietnamese bank transfers through a VietQR code on a hosted checkout
 * page (https://payos.vn/docs/). The flow differs from Telegram Stars:
 *
 * 1. `createInvoice` stores a `PaymentOrder` and asks PayOS for a payment link.
 * 2. The buyer pays in their banking app; PayOS calls the webhook
 *    (`POST /api/webhooks/payos`), whose signature is verified with the checksum key.
 * 3. The paid order becomes a `Payment` (idempotent per order) and the bot thanks the buyer.
 *
 * PayOS has no refund API: refunds are bank transfers made by the admin, and the
 * dashboard only records them (`refundMode: "manual"`).
 */
@Injectable()
export class PayOsProvider implements PaymentProvider {
  readonly name = PAYOS;
  readonly currency = VND;
  readonly refundMode = "manual" as const;
  private readonly logger = new Logger("PayOS");
  private readonly client: PayOsClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly i18n: BotI18n,
    @InjectBot() private readonly bot: Bot<BotContext>,
  ) {
    const credentials = config.payos;
    this.client = credentials ? new PayOsClient(credentials) : null;
  }

  /** `false` until PAYOS_CLIENT_ID, PAYOS_API_KEY and PAYOS_CHECKSUM_KEY are set. */
  get enabled(): boolean {
    return this.client !== null;
  }

  async createInvoice(
    { user, item }: InvoiceRequest,
    target: InvoiceTarget,
  ): Promise<CreatedInvoice> {
    if (target.type !== "checkout") {
      throw new BadRequestException("PayOS only creates hosted checkout links");
    }
    const client = this.requireClient();
    const expiresAt = new Date(Date.now() + this.config.env.PAYOS_ORDER_TTL_MINUTES * 60_000);
    const order = await this.createOrder({
      userId: user.id,
      productId: item.productId,
      amount: item.amount,
      expiresAt,
    });

    const returnUrl = this.returnUrl();
    try {
      const link = await client.createPaymentLink({
        orderCode: order.orderCode,
        amount: order.amount,
        // Shown in the buyer's bank statement; at most 9 characters (unlinked accounts).
        description: `TG${order.orderCode.toString(36).toUpperCase()}`,
        returnUrl,
        cancelUrl: returnUrl,
        expiredAt: Math.floor(expiresAt.getTime() / 1000),
        items: [{ name: item.title, quantity: 1, price: order.amount }],
      });
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { checkoutUrl: link.checkoutUrl, externalId: link.paymentLinkId },
      });
      return {
        type: "checkout",
        url: link.checkoutUrl,
        orderCode: order.orderCode,
        amount: order.amount,
        currency: VND,
        expiresAt,
      };
    } catch (error) {
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });
      this.logger.error(`Creating payment link ${order.orderCode} failed: ${String(error)}`);
      throw new BadGatewayException(
        `PayOS refused the payment: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Bank transfers have no Telegram pre-checkout step. */
  async handlePreCheckout(): Promise<PreCheckoutDecision> {
    return { ok: false, reason: "invalid" };
  }

  /**
   * Verifies and applies a webhook call. Only a valid signature is trusted; unknown
   * orders (such as the sample PayOS sends when the webhook is confirmed) are ignored.
   */
  async handleWebhook(body: unknown): Promise<WebhookOutcome> {
    const client = this.requireClient();
    const { data, signature } = (body ?? {}) as { data?: unknown; signature?: unknown };
    if (
      typeof data !== "object" ||
      data === null ||
      typeof signature !== "string" ||
      !payosVerify(data as Record<string, unknown>, signature, client.checksumKey)
    ) {
      throw new BadRequestException("Invalid PayOS signature");
    }
    const payment = data as PayOsWebhookData;
    if (payment.code !== "00") return "ignored";

    const recorded = await this.handleSuccess({
      fromTelegramId: 0n,
      currency: payment.currency ?? VND,
      totalAmount: Number(payment.amount),
      invoicePayload: String(payment.orderCode),
      chargeId: String(payment.reference ?? payment.paymentLinkId ?? payment.orderCode),
    }).catch((error: unknown) => {
      if (error instanceof IgnoredWebhook) {
        this.logger.warn(`Webhook for order ${payment.orderCode} ignored: ${error.message}`);
        return null;
      }
      throw error;
    });
    if (!recorded) return "ignored";
    return recorded.created ? "recorded" : "duplicate";
  }

  /**
   * Turns a paid order into a `Payment`, once. `invoicePayload` is the order code.
   * A late payment of an expired or cancelled order is recorded too: the money arrived.
   */
  async handleSuccess(request: SuccessfulPaymentRequest): Promise<RecordedPayment> {
    const orderCode = Number(request.invoicePayload);
    const order = Number.isSafeInteger(orderCode)
      ? await this.prisma.paymentOrder.findUnique({
          where: { orderCode },
          include: { user: true, product: { select: { title: true } } },
        })
      : null;
    if (!order || order.provider !== PAYOS) throw new IgnoredWebhook("unknown order");
    if (order.amount !== request.totalAmount || order.currency !== request.currency) {
      throw new IgnoredWebhook(
        `paid ${request.totalAmount} ${request.currency}, expected ${order.amount} ${order.currency}`,
      );
    }

    const chargeId = `${PAYOS}:${order.orderCode}`;
    const { payment, created } = await this.prisma.$transaction(async (tx) => {
      await tx.paymentOrder.updateMany({
        where: { id: order.id, status: { not: "PAID" } },
        data: { status: "PAID", paidAt: new Date() },
      });
      const inserted = await tx.payment.createMany({
        data: {
          userId: order.userId,
          productId: order.productId,
          amount: order.amount,
          currency: order.currency,
          provider: PAYOS,
          telegramPaymentChargeId: chargeId,
          invoicePayload: String(order.orderCode),
        },
        skipDuplicates: true,
      });
      const row = await tx.payment.findUniqueOrThrow({
        where: { telegramPaymentChargeId: chargeId },
      });
      return { payment: row, created: inserted.count === 1 };
    });

    if (created) {
      this.logger.log(
        `Payment ${order.orderCode}: ${order.amount} ${order.currency} (${request.chargeId})`,
      );
      await this.thank(order, payment);
    }
    return { payment, created };
  }

  /** PayOS has no refund API: the admin transfers the money back; nothing to call here. */
  async refund(): Promise<void> {}

  private async thank(
    order: PaymentOrder & { user: { telegramId: bigint; locale: string } } & {
      product: { title: string } | null;
    },
    payment: Payment,
  ): Promise<void> {
    const locale = negotiateLocale(order.user.locale);
    const amount = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US").format(
      payment.amount,
    );
    const text = order.product
      ? this.i18n.t(locale, "payment-thanks-vnd", {
          amount,
          title: escapeHtml(order.product.title),
        })
      : this.i18n.t(locale, "payment-thanks-vnd-generic", { amount });
    await this.bot.api
      .sendMessage(Number(order.user.telegramId), text, { parse_mode: "HTML" })
      .catch((error: unknown) => this.logger.warn(`Could not thank the buyer: ${String(error)}`));
  }

  private requireClient(): PayOsClient {
    if (!this.client) throw new ServiceUnavailableException("PayOS is not configured");
    return this.client;
  }

  /** The bot's chat by default: the buyer pays in a browser, then comes back to Telegram. */
  private returnUrl(): string {
    if (this.config.env.PAYOS_RETURN_URL) return this.config.env.PAYOS_RETURN_URL;
    try {
      return `https://t.me/${this.bot.botInfo.username}`;
    } catch {
      return this.config.env.MINIAPP_URL; // bot not initialized (getMe failed)
    }
  }

  private async createOrder(data: {
    userId: string;
    productId: string | null;
    amount: number;
    expiresAt: Date;
  }): Promise<PaymentOrder> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.paymentOrder.create({
          data: {
            ...data,
            orderCode: randomInt(1, MAX_ORDER_CODE),
            provider: PAYOS,
            currency: VND,
            checkoutUrl: "",
          },
        });
      } catch (error) {
        const duplicate =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
        if (!duplicate || attempt >= 4) throw error;
      }
    }
  }
}

/** A correctly signed webhook we do not act on (unknown order, amount mismatch). */
class IgnoredWebhook extends Error {}
