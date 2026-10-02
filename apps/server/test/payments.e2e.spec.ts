import { Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Payment, User } from "@tgstack/db";
import {
  createCallbackQueryUpdate,
  createCommandUpdate,
  createTextUpdate,
} from "@tgstack/nestjs-grammy/testing";
import { signInitData } from "@tgstack/shared";
import type { Update } from "grammy/types";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InvoicePayloadSigner } from "../src/payments/invoice-payload.js";
import {
  type CreatedInvoice,
  PAYMENT_PROVIDERS,
  type PaymentProvider,
  type PreCheckoutDecision,
  type RecordedPayment,
} from "../src/payments/payment-provider.js";
import { PaymentsService } from "../src/payments/payments.service.js";
import { TelegramStarsProvider } from "../src/payments/telegram-stars.provider.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { type BotTestApp, createBotTestApp, resetState, user } from "./helpers/bot-app.js";
import { TEST_BOT_TOKEN, TEST_JWT_SECRET } from "./helpers/env.js";

const buyer = user({ id: 400_000_001, first_name: "Bao", language_code: "en" });
const signer = new InvoicePayloadSigner(TEST_JWT_SECRET);
let updateId = 10_000;

function preCheckout(payload: string, totalAmount: number, currency = "XTR"): Update {
  return {
    update_id: updateId++,
    pre_checkout_query: {
      id: `pcq-${updateId}`,
      from: buyer,
      currency,
      total_amount: totalAmount,
      invoice_payload: payload,
    },
  };
}

function successfulPayment(payload: string, amount: number, chargeId: string): Update {
  return {
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: buyer.id, type: "private", first_name: buyer.first_name },
      from: buyer,
      successful_payment: {
        currency: "XTR",
        total_amount: amount,
        invoice_payload: payload,
        telegram_payment_charge_id: chargeId,
        provider_payment_charge_id: "",
      },
    },
  } as Update;
}

describe("Telegram Stars flow", () => {
  let t: BotTestApp;
  let product: { id: string; priceStars: number };
  let buyerRow: User;

  beforeAll(async () => {
    t = await createBotTestApp();
  });
  beforeEach(async () => {
    await resetState(t);
    product = await t.prisma.product.create({
      data: { title: "Pro plan", description: "Pro features", priceStars: 100 },
    });
    // The buyer exists because they talked to the bot (or opened the Mini App) before paying.
    await t.send(createCommandUpdate("start", "", { from: buyer }));
    buyerRow = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(buyer.id) } });
    t.api.reset();
  });
  afterAll(async () => {
    await t.close();
  });

  const answers = () => t.api.callsTo("answerPreCheckoutQuery").map((c) => c.payload);

  it("goes from Mini App invoice to a recorded payment", async () => {
    const initData = await signInitData(
      { auth_date: Math.floor(Date.now() / 1000), user: { id: buyer.id, first_name: "Bao" } },
      TEST_BOT_TOKEN,
    );
    await request(t.app.getHttpServer())
      .post(`/api/app/products/${product.id}/invoice`)
      .set("Authorization", `tma ${initData}`)
      .expect(201);
    const payload = String(t.api.callsTo("createInvoiceLink")[0]?.payload.payload);

    await t.send(preCheckout(payload, 100));
    expect(answers()).toEqual([{ pre_checkout_query_id: expect.any(String), ok: true }]);

    await t.send(successfulPayment(payload, 100, "stx_happy"));
    const payment = await t.prisma.payment.findUniqueOrThrow({
      where: { telegramPaymentChargeId: "stx_happy" },
    });
    expect(payment).toMatchObject({
      userId: buyerRow.id,
      productId: product.id,
      amount: 100,
      currency: "XTR",
      provider: "telegram-stars",
      status: "PAID",
      invoicePayload: payload,
    });
    expect(t.texts().at(-1)).toBe("🎉 Thank you! We received 100 ⭐ for “Pro plan”.");
  });

  it("records a duplicated successful_payment once", async () => {
    const payload = signer.sign({ productId: product.id, userId: buyerRow.id });
    await t.send(successfulPayment(payload, 100, "stx_dup"));
    await t.send(successfulPayment(payload, 100, "stx_dup"));
    expect(await t.prisma.payment.count({ where: { telegramPaymentChargeId: "stx_dup" } })).toBe(1);
    expect(t.texts().filter((text) => text.startsWith("🎉"))).toHaveLength(1);
  });

  it("records payments even while a conversation is active", async () => {
    await t.send(createCommandUpdate("onboarding", "", { from: buyer }));
    const payload = signer.sign({ productId: product.id, userId: buyerRow.id });
    await t.send(successfulPayment(payload, 100, "stx_conversation"));
    expect(await t.prisma.payment.count()).toBe(1);
    // …and the wizard is still waiting for the name.
    await t.send(createTextUpdate("Bao", { from: buyer }));
    expect(t.texts().at(-1)).toContain("Nice to meet you, <b>Bao</b>!");
  });

  it.each([
    [
      "a forged payload",
      () => `${signer.sign({ productId: "x", userId: "y" })}tampered`,
      100,
      "invalid",
    ],
    [
      "a payload signed for someone else",
      () => signer.sign({ productId: product.id, userId: "other" }),
      100,
      "invalid",
    ],
    [
      "a changed price",
      () => signer.sign({ productId: product.id, userId: buyerRow.id }),
      90,
      "price",
    ],
  ])("rejects %s at pre-checkout", async (_name, payload, amount, reason) => {
    await t.send(preCheckout(payload(), amount));
    const [answer] = answers();
    expect(answer?.ok).toBe(false);
    expect(String(answer?.error_message)).toMatch(
      reason === "price" ? /price has changed/ : /no longer valid/,
    );
  });

  it("rejects products that were deactivated after the invoice was created", async () => {
    const payload = signer.sign({ productId: product.id, userId: buyerRow.id });
    await t.prisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    await t.send(preCheckout(payload, 100));
    expect(answers()[0]).toMatchObject({
      ok: false,
      error_message: "Sorry, this product is no longer available.",
    });
  });

  it("answers even when it cannot handle the currency", async () => {
    await t.send(preCheckout("anything", 100, "USD"));
    expect(answers()[0]).toMatchObject({
      ok: false,
      error_message: "The payment could not be processed. Please try again.",
    });
  });

  it("refunds through the provider and marks the payment REFUNDED", async () => {
    const payload = signer.sign({ productId: product.id, userId: buyerRow.id });
    await t.send(successfulPayment(payload, 100, "stx_refund"));
    const payment = await t.prisma.payment.findUniqueOrThrow({
      where: { telegramPaymentChargeId: "stx_refund" },
    });

    const refunded = await t.app.get(PaymentsService).refund(payment.id);
    expect(refunded.status).toBe("REFUNDED");
    expect(t.api.callsTo("refundStarPayment")[0]?.payload).toEqual({
      user_id: buyer.id,
      telegram_payment_charge_id: "stx_refund",
    });
  });

  describe("/buy (EXAMPLE)", () => {
    it("lists products and sends a Stars invoice to the chat", async () => {
      await t.send(createCommandUpdate("buy", "", { from: buyer }));
      const keyboard = t.api.callsTo("sendMessage")[0]?.payload.reply_markup.inline_keyboard;
      expect(keyboard).toEqual([
        [{ text: "Pro plan — 100 ⭐", callback_data: `buy:${product.id}` }],
      ]);

      await t.send(createCallbackQueryUpdate(`buy:${product.id}`, { from: buyer }));
      const [invoice] = t.api.callsTo("sendInvoice");
      expect(invoice?.payload).toMatchObject({
        chat_id: buyer.id,
        title: "Pro plan",
        description: "Pro features",
        currency: "XTR",
        prices: [{ label: "Pro plan", amount: 100 }],
      });
      expect(invoice?.payload.provider_token).toBeUndefined();
      expect(signer.verify(String(invoice?.payload.payload))).toMatchObject({
        productId: product.id,
        userId: buyerRow.id,
      });
    });

    it("explains when a product is gone", async () => {
      await t.send(createCallbackQueryUpdate("buy:missing", { from: buyer }));
      expect(t.texts().at(-1)).toBe("Sorry, this product is no longer available.");
      expect(t.api.callsTo("sendInvoice")).toHaveLength(0);
    });
  });
});

describe("PaymentProvider registry", () => {
  /** A second provider, as a VietQR/PayOS integration would be. */
  @Injectable()
  class FakeBankProvider implements PaymentProvider {
    readonly name = "fake-bank";
    readonly currency = "VND";
    readonly refunded: string[] = [];
    async createInvoice(): Promise<CreatedInvoice> {
      return { type: "link", url: "https://bank.example/pay/1" };
    }
    async handlePreCheckout(): Promise<PreCheckoutDecision> {
      return { ok: true };
    }
    async handleSuccess(): Promise<RecordedPayment> {
      throw new Error("not used");
    }
    async refund(payment: Payment & { user: User }): Promise<void> {
      this.refunded.push(payment.id);
    }
  }

  it("resolves providers by name and currency and routes refunds", async () => {
    const stars = { name: "telegram-stars", currency: "XTR" } as TelegramStarsProvider;
    @Module({
      providers: [
        FakeBankProvider,
        { provide: TelegramStarsProvider, useValue: stars },
        {
          provide: PAYMENT_PROVIDERS,
          inject: [TelegramStarsProvider, FakeBankProvider],
          useFactory: (...providers: PaymentProvider[]) => providers,
        },
        PaymentsService,
        {
          provide: PrismaService,
          useValue: {
            payment: {
              findUnique: async () => ({
                id: "p1",
                status: "PAID",
                provider: "fake-bank",
                user: {},
              }),
              update: async () => ({
                id: "p1",
                amount: 50_000,
                currency: "VND",
                provider: "fake-bank",
                status: "REFUNDED",
                telegramPaymentChargeId: "bank-1",
                createdAt: new Date(),
                refundedAt: new Date(),
                user: { id: "u", telegramId: 1n, username: null, firstName: "A" },
                product: null,
              }),
            },
          },
        },
      ],
    })
    class PaymentsTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [PaymentsTestModule] }).compile();
    const payments = moduleRef.get(PaymentsService);
    expect(payments.providerNames).toEqual(["telegram-stars", "fake-bank"]);
    expect(payments.getProvider("fake-bank")).toBeInstanceOf(FakeBankProvider);
    expect(payments.getProviderForCurrency("XTR")).toBe(stars);
    expect(() => payments.getProvider("paypal")).toThrow(/not configured/);

    const refunded = await payments.refund("p1");
    expect(refunded.status).toBe("REFUNDED");
    expect(moduleRef.get(FakeBankProvider).refunded).toEqual(["p1"]);
  });
});
