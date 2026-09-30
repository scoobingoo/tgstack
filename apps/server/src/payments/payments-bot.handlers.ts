import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Filter } from "grammy";
import type { BotContext } from "../bot/bot.context.js";
import { BotMiddlewares } from "../bot/bot-middlewares.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PaymentsService } from "./payments.service.js";

/**
 * Telegram-native payment updates (Stars and any provider-token gateway):
 * `pre_checkout_query` → accept/reject in time, `successful_payment` → record once.
 *
 * Installed *before* the conversations plugin: an active conversation (say, the
 * onboarding wizard) would otherwise swallow the `successful_payment` message.
 */
@Injectable()
export class PaymentsBotHandlers implements OnModuleInit {
  private readonly logger = new Logger("Payments");

  constructor(
    private readonly middlewares: BotMiddlewares,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.middlewares.beforeConversations.on("pre_checkout_query", (ctx) => this.preCheckout(ctx));
    this.middlewares.beforeConversations.on("message:successful_payment", (ctx) =>
      this.successfulPayment(ctx),
    );
  }

  /** Telegram cancels the checkout unless it gets an answer within 10 seconds: keep this fast. */
  async preCheckout(ctx: Filter<BotContext, "pre_checkout_query">): Promise<void> {
    const query = ctx.preCheckoutQuery;
    try {
      const provider = this.payments.getProviderForCurrency(query.currency);
      const decision = await provider.handlePreCheckout({
        id: query.id,
        fromTelegramId: BigInt(query.from.id),
        currency: query.currency,
        totalAmount: query.total_amount,
        invoicePayload: query.invoice_payload,
      });
      if (decision.ok) {
        await ctx.answerPreCheckoutQuery(false);
      } else {
        await ctx.answerPreCheckoutQuery(false, {
          error_message: ctx.t(`payment-error-${decision.reason}`),
        });
      }
    } catch (error) {
      // Always answer, even on failure: an unanswered query spins until it times out.
      this.logger.error(`Pre-checkout ${query.id} failed: ${String(error)}`);
      await ctx.answerPreCheckoutQuery(false, { error_message: ctx.t("payment-error-generic") });
    }
  }

  async successfulPayment(ctx: Filter<BotContext, "message:successful_payment">): Promise<void> {
    const paid = ctx.message.successful_payment;
    const provider = this.payments.getProviderForCurrency(paid.currency);
    const { payment, created } = await provider.handleSuccess({
      fromTelegramId: BigInt(ctx.from.id),
      currency: paid.currency,
      totalAmount: paid.total_amount,
      invoicePayload: paid.invoice_payload,
      chargeId: paid.telegram_payment_charge_id,
    });
    if (!created) {
      this.logger.warn(
        `Duplicate successful_payment for charge ${paid.telegram_payment_charge_id} ignored`,
      );
      return;
    }

    this.logger.log(
      `Payment ${payment.id}: ${payment.amount} ${payment.currency} from ${ctx.from.id}`,
    );
    const product = payment.productId
      ? await this.prisma.product.findUnique({
          where: { id: payment.productId },
          select: { title: true },
        })
      : null;
    await ctx.reply(
      product
        ? ctx.t("payment-thanks", { amount: payment.amount, title: product.title })
        : ctx.t("payment-thanks-generic", { amount: payment.amount }),
    );
  }
}