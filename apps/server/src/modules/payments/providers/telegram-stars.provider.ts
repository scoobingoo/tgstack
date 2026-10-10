import { Injectable, Logger } from "@nestjs/common";
import type { Payment, User } from "@tgstack/db";
import { InjectBot } from "@tgstack/nestjs-grammy";
import type { Bot } from "grammy";
import type { BotContext } from "../../../bot/bot.context.js";
import { AppConfig } from "../../../config/app-config.js";
import { PrismaService } from "../../../infra/prisma/prisma.service.js";
import type {
  CreatedInvoice,
  InvoiceRequest,
  InvoiceTarget,
  PaymentProvider,
  PreCheckoutDecision,
  PreCheckoutRequest,
  RecordedPayment,
  SuccessfulPaymentRequest,
} from "../interfaces/payment-provider.interface.js";
import { InvoicePayloadSigner } from "../invoice-payload.js";

export const TELEGRAM_STARS = "telegram-stars";
const XTR = "XTR";

/**
 * Telegram Stars (currency `XTR`, empty provider token).
 * See https://core.telegram.org/bots/payments-stars.
 */
@Injectable()
export class TelegramStarsProvider implements PaymentProvider {
  readonly name = TELEGRAM_STARS;
  readonly currency = XTR;
  private readonly logger = new Logger("TelegramStars");
  private readonly signer: InvoicePayloadSigner;

  constructor(
    @InjectBot() private readonly bot: Bot<BotContext>,
    private readonly prisma: PrismaService,
    config: AppConfig,
  ) {
    this.signer = new InvoicePayloadSigner(config.env.JWT_SECRET);
  }

  async createInvoice(
    { user, item }: InvoiceRequest,
    target: InvoiceTarget,
  ): Promise<CreatedInvoice> {
    const payload = this.signer.sign({ productId: item.productId, userId: user.id });
    const prices = [{ label: item.title, amount: item.amount }];
    const photo = item.photoUrl ? { photo_url: item.photoUrl } : {};

    if (target.type === "link") {
      // Stars: the provider token must be empty.
      const url = await this.bot.api.createInvoiceLink(
        item.title,
        item.description,
        payload,
        "",
        XTR,
        prices,
        photo,
      );
      return { type: "link", url };
    }
    const message = await this.bot.api.sendInvoice(
      target.chatId,
      item.title,
      item.description,
      payload,
      XTR,
      prices,
      photo,
    );
    return { type: "chat", messageId: message.message_id };
  }

  /** Only fast lookups here: Telegram cancels the checkout if we take longer than ~10 s. */
  async handlePreCheckout(request: PreCheckoutRequest): Promise<PreCheckoutDecision> {
    if (request.currency !== XTR) return { ok: false, reason: "invalid" };
    const payload = this.signer.verify(request.invoicePayload);
    if (!payload) return { ok: false, reason: "invalid" };

    const user = await this.prisma.user.findUnique({
      where: { telegramId: request.fromTelegramId },
      select: { id: true },
    });
    if (!user || user.id !== payload.userId) return { ok: false, reason: "invalid" };

    if (payload.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: payload.productId },
        select: { isActive: true, priceStars: true },
      });
      if (!product?.isActive) return { ok: false, reason: "unavailable" };
      if (product.priceStars !== request.totalAmount) return { ok: false, reason: "price-changed" };
    }
    return { ok: true };
  }

  /** Idempotent: the same `telegram_payment_charge_id` is recorded once. */
  async handleSuccess(request: SuccessfulPaymentRequest): Promise<RecordedPayment> {
    const payload = this.signer.verify(request.invoicePayload);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { telegramId: request.fromTelegramId },
    });
    if (!payload || payload.userId !== user.id) {
      // Telegram already charged the user; record it anyway and flag it in the logs.
      this.logger.warn(`Payment ${request.chargeId} has an unexpected payload; recording it.`);
    }
    const productId = payload?.productId
      ? ((
          await this.prisma.product.findUnique({
            where: { id: payload.productId },
            select: { id: true },
          })
        )?.id ?? null)
      : null;

    const { count } = await this.prisma.payment.createMany({
      data: [
        {
          userId: user.id,
          productId,
          amount: request.totalAmount,
          currency: request.currency,
          provider: this.name,
          telegramPaymentChargeId: request.chargeId,
          invoicePayload: request.invoicePayload,
        },
      ],
      skipDuplicates: true, // ON CONFLICT DO NOTHING on the unique charge ID
    });
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { telegramPaymentChargeId: request.chargeId },
    });
    return { payment, created: count === 1 };
  }

  async refund(payment: Payment & { user: User }): Promise<void> {
    await this.bot.api.refundStarPayment(
      Number(payment.user.telegramId),
      payment.telegramPaymentChargeId,
    );
  }
}
