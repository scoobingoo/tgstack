import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { User } from "@tgstack/db";
import { signInitData } from "@tgstack/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PaymentsService } from "../src/modules/payments/payments.service.js";
import {
  payosPaymentRequestSignature,
  payosSign,
  payosVerify,
} from "../src/modules/payments/providers/payos/payos.signature.js";
import { createAdminSession, createUser } from "./helpers/admin.js";
import { type BotTestApp, createBotTestApp, resetState } from "./helpers/bot-app.js";
import { TEST_BOT_TOKEN } from "./helpers/env.js";

/** Test vector from https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/ */
const DOCS_KEY = "1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675";
const DOCS_DATA = {
  orderCode: 123,
  amount: 3000,
  description: "VQRIO123",
  accountNumber: "12345678",
  reference: "TF230204212323",
  transactionDateTime: "2023-02-04 18:25:00",
  currency: "VND",
  paymentLinkId: "124c33293c43417ab7879e14c8d9eb18",
  code: "00",
  desc: "Thành công",
  counterAccountBankId: "",
  counterAccountBankName: "",
  counterAccountName: "",
  counterAccountNumber: "",
  virtualAccountName: "",
  virtualAccountNumber: "",
};

describe("PayOS signatures", () => {
  it("matches the documented webhook example", () => {
    expect(payosSign(DOCS_DATA, DOCS_KEY)).toBe(
      "412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03",
    );
    expect(
      payosVerify(
        DOCS_DATA,
        "412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03",
        DOCS_KEY,
      ),
    ).toBe(true);
  });

  it("rejects tampered data and malformed signatures", () => {
    const signature = payosSign(DOCS_DATA, DOCS_KEY);
    expect(payosVerify({ ...DOCS_DATA, amount: 30000 }, signature, DOCS_KEY)).toBe(false);
    expect(payosVerify(DOCS_DATA, "not-hex", DOCS_KEY)).toBe(false);
    expect(payosVerify(DOCS_DATA, signature.toUpperCase(), DOCS_KEY)).toBe(true);
  });

  it("treats null as empty and serializes arrays as JSON with sorted keys", () => {
    const withNull = payosSign({ b: null, a: 1 }, "k");
    expect(withNull).toBe(payosSign({ a: 1, b: "" }, "k"));
    expect(payosSign({ items: [{ quantity: 1, name: "A" }] }, "k")).toBe(
      payosSign({ items: '[{"name":"A","quantity":1}]' }, "k"),
    );
  });
});

/** A local stand-in for https://api-merchant.payos.vn (PayOS has no sandbox). */
interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}
const payosRequests: RecordedRequest[] = [];
let payosAnswer: (body: Record<string, unknown>) => { code: string; desc: string; data: unknown };

const CHECKSUM_KEY = "test-checksum-key";
const defaultAnswer = (body: Record<string, unknown>) => ({
  code: "00",
  desc: "success",
  data: {
    paymentLinkId: `link-${body.orderCode}`,
    checkoutUrl: `https://pay.payos.vn/web/link-${body.orderCode}`,
    qrCode: "000201010212",
    status: "PENDING",
  },
});

let payos: Server;
let t: BotTestApp;
let buyer: User;
let productId: string;

beforeAll(async () => {
  payos = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      payosRequests.push({
        method: req.method ?? "",
        path: req.url ?? "",
        headers: req.headers,
        body,
      });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payosAnswer(body)));
    });
  });
  await new Promise<void>((resolve) => payos.listen(0, "127.0.0.1", resolve));
  const { port } = payos.address() as AddressInfo;
  t = await createBotTestApp({
    env: {
      PAYOS_CLIENT_ID: "client-id",
      PAYOS_API_KEY: "api-key",
      PAYOS_CHECKSUM_KEY: CHECKSUM_KEY,
      PAYOS_API_URL: `http://127.0.0.1:${port}`,
    },
  });
});
beforeEach(async () => {
  await resetState(t);
  payosRequests.length = 0;
  payosAnswer = defaultAnswer;
  buyer = await createUser(t, { telegramId: 600_000_001n, firstName: "Lan", locale: "vi" });
  productId = (
    await t.prisma.product.create({
      data: { title: "Gói Pro", description: "Pro", priceStars: 100, priceVnd: 50_000 },
    })
  ).id;
});
afterAll(async () => {
  await t.close();
  await new Promise((resolve) => payos.close(resolve));
});

const http = () => request(t.app.getHttpServer());
async function tma(user: User = buyer): Promise<string> {
  const initData = await signInitData(
    {
      auth_date: Math.floor(Date.now() / 1000),
      user: { id: Number(user.telegramId), first_name: user.firstName },
    },
    TEST_BOT_TOKEN,
  );
  return `tma ${initData}`;
}

async function checkout(): Promise<{ orderCode: number; url: string; amount: number }> {
  const { body } = await http()
    .post(`/api/app/products/${productId}/checkout`)
    .set("Authorization", await tma())
    .expect(201);
  return body;
}

/** A webhook body as PayOS signs it. */
function webhook(data: Record<string, unknown>, key = CHECKSUM_KEY) {
  const full = {
    accountNumber: "12345678",
    reference: "FT123",
    transactionDateTime: "2026-10-22 10:00:00",
    currency: "VND",
    paymentLinkId: "link",
    code: "00",
    desc: "Thành công",
    description: "TG1",
    ...data,
  };
  return {
    code: "00",
    desc: "success",
    success: true,
    data: full,
    signature: payosSign(full, key),
  };
}

describe("PayOS checkout", () => {
  it("creates a signed payment link and a pending order", async () => {
    const result = await checkout();
    expect(result).toMatchObject({ amount: 50_000, currency: "VND" });
    expect(result.url).toBe(`https://pay.payos.vn/web/link-${result.orderCode}`);

    const [call] = payosRequests;
    expect(call).toMatchObject({ method: "POST", path: "/v2/payment-requests" });
    expect(call?.headers["x-client-id"]).toBe("client-id");
    expect(call?.headers["x-api-key"]).toBe("api-key");
    const body = call?.body as {
      orderCode: number;
      amount: number;
      description: string;
      returnUrl: string;
      cancelUrl: string;
      signature: string;
      expiredAt: number;
    };
    expect(body.amount).toBe(50_000);
    expect(body.description.length).toBeLessThanOrEqual(9);
    expect(body.returnUrl).toMatch(/^https:\/\/t\.me\//);
    expect(body.expiredAt).toBeGreaterThan(Date.now() / 1000);
    expect(body.signature).toBe(payosPaymentRequestSignature(body, CHECKSUM_KEY));

    const order = await t.prisma.paymentOrder.findUniqueOrThrow({
      where: { orderCode: result.orderCode },
    });
    expect(order).toMatchObject({ status: "PENDING", amount: 50_000, userId: buyer.id, productId });
  });

  it("answers 502 and cancels the order when PayOS refuses", async () => {
    payosAnswer = () => ({ code: "231", desc: "Đơn thanh toán đã tồn tại", data: null });
    const response = await http()
      .post(`/api/app/products/${productId}/checkout`)
      .set("Authorization", await tma())
      .expect(502);
    expect(response.body.message).toContain("Đơn thanh toán đã tồn tại");
    expect(await t.prisma.paymentOrder.findFirstOrThrow()).toMatchObject({ status: "CANCELLED" });
  });

  it("refuses products without a VND price", async () => {
    await t.prisma.product.update({ where: { id: productId }, data: { priceVnd: null } });
    await http()
      .post(`/api/app/products/${productId}/checkout`)
      .set("Authorization", await tma())
      .expect(400);
  });
});

describe("PayOS webhook", () => {
  it("records the payment once, thanks the buyer and reports the order as paid", async () => {
    const { orderCode } = await checkout();
    t.api.reset();

    const first = await http()
      .post("/api/webhooks/payos")
      .send(webhook({ orderCode, amount: 50_000 }))
      .expect(200);
    expect(first.body).toEqual({ result: "recorded" });
    const again = await http()
      .post("/api/webhooks/payos")
      .send(webhook({ orderCode, amount: 50_000 }))
      .expect(200);
    expect(again.body).toEqual({ result: "duplicate" });

    const payments = await t.prisma.payment.findMany();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider: "payos",
      currency: "VND",
      amount: 50_000,
      status: "PAID",
      userId: buyer.id,
      productId,
    });
    const thanks = t.api.callsTo("sendMessage");
    expect(thanks).toHaveLength(1);
    expect(thanks[0]?.payload).toMatchObject({ chat_id: 600_000_001 });
    expect(String(thanks[0]?.payload.text)).toContain("50.000 ₫");

    const { body: status } = await http()
      .get(`/api/app/payment-orders/${orderCode}`)
      .set("Authorization", await tma())
      .expect(200);
    expect(status).toMatchObject({ orderCode, status: "PAID", amount: 50_000 });
  });

  it("rejects a bad signature", async () => {
    const { orderCode } = await checkout();
    await http()
      .post("/api/webhooks/payos")
      .send(webhook({ orderCode, amount: 50_000 }, "wrong-key"))
      .expect(400);
    await http().post("/api/webhooks/payos").send({ data: {} }).expect(400);
    expect(await t.prisma.payment.count()).toBe(0);
  });

  it("ignores unknown orders (the sample PayOS sends to confirm a webhook) and wrong amounts", async () => {
    const { orderCode } = await checkout();
    for (const data of [
      { orderCode: 123, amount: 3000 },
      { orderCode, amount: 5_000 },
      { orderCode, amount: 50_000, code: "01" },
    ]) {
      const { body } = await http().post("/api/webhooks/payos").send(webhook(data)).expect(200);
      expect(body).toEqual({ result: "ignored" });
    }
    expect(await t.prisma.payment.count()).toBe(0);
  });

  it("records a payment that arrives after the order expired", async () => {
    const { orderCode } = await checkout();
    await t.prisma.paymentOrder.update({
      where: { orderCode },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const { body: expired } = await http()
      .get(`/api/app/payment-orders/${orderCode}`)
      .set("Authorization", await tma())
      .expect(200);
    expect(expired.status).toBe("EXPIRED");

    await http()
      .post("/api/webhooks/payos")
      .send(webhook({ orderCode, amount: 50_000 }))
      .expect(200);
    expect(await t.prisma.paymentOrder.findUniqueOrThrow({ where: { orderCode } })).toMatchObject({
      status: "PAID",
    });
  });
});

describe("PayOS orders, refunds and stats", () => {
  it("hides other users' orders", async () => {
    const { orderCode } = await checkout();
    const other = await createUser(t, { telegramId: 600_000_002n });
    await http()
      .get(`/api/app/payment-orders/${orderCode}`)
      .set("Authorization", await tma(other))
      .expect(404);
  });

  it("refunds manually: the payment is marked, nothing is sent to PayOS", async () => {
    const { orderCode } = await checkout();
    await http()
      .post("/api/webhooks/payos")
      .send(webhook({ orderCode, amount: 50_000 }))
      .expect(200);
    const { cookie } = await createAdminSession(t);
    const { body: list } = await http()
      .get("/api/admin/payments")
      .set("Cookie", cookie)
      .expect(200);
    expect(list.items[0]).toMatchObject({ provider: "payos", refundMode: "manual" });

    const requestsBefore = payosRequests.length;
    const { body: refunded } = await http()
      .post(`/api/admin/payments/${list.items[0].id}/refund`)
      .set("Cookie", cookie)
      .expect(200);
    expect(refunded.status).toBe("REFUNDED");
    expect(payosRequests).toHaveLength(requestsBefore);
  });

  it("counts VND revenue separately from Stars", async () => {
    const { orderCode } = await checkout();
    await http()
      .post("/api/webhooks/payos")
      .send(webhook({ orderCode, amount: 50_000 }))
      .expect(200);
    const { cookie } = await createAdminSession(t);
    const { body: stats } = await http().get("/api/admin/stats").set("Cookie", cookie).expect(200);
    expect(stats).toMatchObject({ revenueVnd: 50_000, revenueStars: 0 });
  });

  it("registers PayOS next to Telegram Stars and shows VND prices", async () => {
    expect(t.app.get(PaymentsService).providerNames).toEqual(["telegram-stars", "payos"]);
    const { body } = await http()
      .get("/api/app/products")
      .set("Authorization", await tma())
      .expect(200);
    expect(body[0].priceVnd).toBe(50_000);
  });
});

describe("PayOS disabled", () => {
  let off: BotTestApp;
  beforeAll(async () => {
    off = await createBotTestApp();
  });
  afterAll(async () => {
    await off.close();
  });

  it("is not registered, hides VND prices and refuses checkouts", async () => {
    await resetState(off);
    const user = await createUser(off, { telegramId: 600_000_003n });
    const product = await off.prisma.product.create({
      data: { title: "Pro", description: "Pro", priceStars: 100, priceVnd: 50_000 },
    });
    expect(off.app.get(PaymentsService).providerNames).toEqual(["telegram-stars"]);
    const auth = await tma(user);
    const { body } = await request(off.app.getHttpServer())
      .get("/api/app/products")
      .set("Authorization", auth)
      .expect(200);
    expect(body[0].priceVnd).toBeNull();
    await request(off.app.getHttpServer())
      .post(`/api/app/products/${product.id}/checkout`)
      .set("Authorization", auth)
      .expect(503);
  });
});
