import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StatsService } from "../src/modules/stats/stats.service.js";
import { createAdminSession, createUser } from "./helpers/admin.js";
import { type BotTestApp, createBotTestApp, resetState } from "./helpers/bot-app.js";

let t: BotTestApp;
let cookie: string;
let adminId: string;

beforeAll(async () => {
  t = await createBotTestApp();
});
beforeEach(async () => {
  await resetState(t);
  const session = await createAdminSession(t);
  cookie = session.cookie;
  adminId = session.admin.id;
});
afterAll(async () => {
  await t.close();
});

const http = () => request(t.app.getHttpServer());
const DAY = 24 * 60 * 60 * 1000;

async function createPayment(userId: string, amount: number, data: Record<string, unknown> = {}) {
  return t.prisma.payment.create({
    data: {
      userId,
      amount,
      currency: "XTR",
      provider: "telegram-stars",
      telegramPaymentChargeId: `charge_${Math.random().toString(36).slice(2)}`,
      invoicePayload: "test",
      ...data,
    },
  });
}

describe("authentication on /api/admin/*", () => {
  it.each([
    ["get", "/api/admin/stats"],
    ["get", "/api/admin/users"],
    ["get", "/api/admin/users/x"],
    ["patch", "/api/admin/users/x"],
    ["get", "/api/admin/products"],
    ["post", "/api/admin/products"],
    ["patch", "/api/admin/products/x"],
    ["delete", "/api/admin/products/x"],
    ["get", "/api/admin/payments"],
    ["post", "/api/admin/payments/x/refund"],
  ] as const)("%s %s → 401 without a session, 403 for non-admins", async (method, path) => {
    await http()[method](path).expect(401);
    const regular = await createUser(t, { role: "USER" });
    const { loginAs } = await import("./helpers/admin.js");
    await http()
      [method](path)
      .set("Cookie", await loginAs(t, regular))
      .expect(403);
  });
});

describe("GET /api/admin/stats", () => {
  it("counts users, activity, blocks and revenue", async () => {
    const now = Date.now();
    const old = await createUser(t, {
      createdAt: new Date(now - 40 * DAY),
      lastSeenAt: new Date(now - 20 * DAY),
    });
    await createUser(t, {
      createdAt: new Date(now - 10 * DAY),
      lastSeenAt: new Date(now - 10 * DAY),
      isBlocked: true,
    });
    const recent = await createUser(t, { createdAt: new Date(now - 3 * DAY) });
    await createPayment(recent.id, 25);
    await createPayment(old.id, 100);
    await createPayment(old.id, 10, { status: "REFUNDED", refundedAt: new Date() });

    const { body } = await http().get("/api/admin/stats").set("Cookie", cookie).expect(200);
    // 3 created here + the admin created "now" in beforeEach.
    expect(body).toMatchObject({
      totalUsers: 4,
      newUsers: { today: 1, last7Days: 2, last30Days: 3 },
      activeUsers7d: 2,
      blockedUsers: 1,
      revenueStars: 125,
    });
    expect(body.dailyNewUsers).toHaveLength(30);
    expect(body.dailyNewUsers.at(-1)).toEqual({
      date: new Date().toISOString().slice(0, 10),
      count: 1,
    });
    expect(body.dailyNewUsers.reduce((sum: number, d: { count: number }) => sum + d.count, 0)).toBe(
      3,
    );
  });

  it("fills days without sign-ups with zeros", async () => {
    const stats = await t.app.get(StatsService).getStats(new Date("2030-01-15T12:00:00Z"));
    expect(stats.dailyNewUsers[0]).toEqual({ date: "2029-12-17", count: 0 });
    expect(stats.dailyNewUsers.at(-1)).toEqual({ date: "2030-01-15", count: 0 });
  });
});

describe("users", () => {
  it("lists, searches and filters users with BigInt-safe IDs", async () => {
    const huge = await createUser(t, { telegramId: 9_007_199_254_740_993n, username: "huge_id" });
    await createUser(t, { username: "linh", firstName: "Linh" });
    await createUser(t, { username: "blocked_one", isBlocked: true });

    const all = await http().get("/api/admin/users?limit=2").set("Cookie", cookie).expect(200);
    expect(all.body).toMatchObject({ total: 4, page: 1, limit: 2 });
    expect(all.body.items).toHaveLength(2);

    const byName = await http()
      .get("/api/admin/users?search=LIN")
      .set("Cookie", cookie)
      .expect(200);
    expect(byName.body.items.map((u: { username: string }) => u.username)).toEqual(["linh"]);

    const byId = await http()
      .get("/api/admin/users?search=9007199254740993")
      .set("Cookie", cookie)
      .expect(200);
    expect(byId.body.items).toEqual([
      expect.objectContaining({ id: huge.id, telegramId: "9007199254740993" }),
    ]);

    const blocked = await http()
      .get("/api/admin/users?blocked=true")
      .set("Cookie", cookie)
      .expect(200);
    expect(blocked.body.items.map((u: { username: string }) => u.username)).toEqual([
      "blocked_one",
    ]);

    const admins = await http()
      .get("/api/admin/users?role=ADMIN")
      .set("Cookie", cookie)
      .expect(200);
    expect(admins.body.items.map((u: { id: string }) => u.id)).toEqual([adminId]);

    await http().get("/api/admin/users?limit=500").set("Cookie", cookie).expect(400);
  });

  it("returns a user with payments", async () => {
    const buyer = await createUser(t);
    await createPayment(buyer.id, 10);
    await createPayment(buyer.id, 5, { status: "REFUNDED", refundedAt: new Date() });

    const { body } = await http()
      .get(`/api/admin/users/${buyer.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(body).toMatchObject({ id: buyer.id, paymentsCount: 2, totalSpentStars: 10 });
    expect(body.payments).toHaveLength(2);
    await http().get("/api/admin/users/nope").set("Cookie", cookie).expect(404);
  });

  it("changes roles but never the caller's own", async () => {
    const target = await createUser(t);
    const { body } = await http()
      .patch(`/api/admin/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ role: "ADMIN" })
      .expect(200);
    expect(body.role).toBe("ADMIN");

    await http()
      .patch(`/api/admin/users/${adminId}`)
      .set("Cookie", cookie)
      .send({ role: "USER" })
      .expect(400);
    await http()
      .patch(`/api/admin/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ role: "GOD" })
      .expect(400);
    await http()
      .patch("/api/admin/users/nope")
      .set("Cookie", cookie)
      .send({ role: "USER" })
      .expect(404);
  });
});

describe("products (EXAMPLE)", () => {
  it("creates, updates, lists and soft-deletes products", async () => {
    const created = await http()
      .post("/api/admin/products")
      .set("Cookie", cookie)
      .send({ title: "Sticker pack", description: "24 stickers", priceStars: 25 })
      .expect(201);
    expect(created.body).toMatchObject({
      title: "Sticker pack",
      priceStars: 25,
      isActive: true,
      imageUrl: null,
    });

    const id = created.body.id as string;
    const updated = await http()
      .patch(`/api/admin/products/${id}`)
      .set("Cookie", cookie)
      .send({ priceStars: 30 })
      .expect(200);
    expect(updated.body.priceStars).toBe(30);

    const deleted = await http()
      .delete(`/api/admin/products/${id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(deleted.body.isActive).toBe(false);
    expect(await t.prisma.product.count()).toBe(1); // still there

    const all = await http().get("/api/admin/products").set("Cookie", cookie).expect(200);
    expect(all.body.total).toBe(1);
    const active = await http()
      .get("/api/admin/products?includeInactive=false")
      .set("Cookie", cookie)
      .expect(200);
    expect(active.body.total).toBe(0);
  });

  it("enforces Bot API invoice limits", async () => {
    const response = await http()
      .post("/api/admin/products")
      .set("Cookie", cookie)
      .send({ title: "x".repeat(33), description: "", priceStars: 0 })
      .expect(400);
    expect(response.body.issues.map((i: { path: string }) => i.path).sort()).toEqual([
      "description",
      "priceStars",
      "title",
    ]);
    await http()
      .patch("/api/admin/products/nope")
      .set("Cookie", cookie)
      .send({ priceStars: 5 })
      .expect(404);
    await http().delete("/api/admin/products/nope").set("Cookie", cookie).expect(404);
  });
});

describe("payments", () => {
  it("lists payments with their user and product", async () => {
    const buyer = await createUser(t, { username: "buyer" });
    const product = await t.prisma.product.create({
      data: { title: "Pro", description: "Pro plan", priceStars: 100 },
    });
    await createPayment(buyer.id, 100, { productId: product.id });
    await createPayment(buyer.id, 5, { status: "REFUNDED", refundedAt: new Date() });

    const { body } = await http().get("/api/admin/payments").set("Cookie", cookie).expect(200);
    expect(body.total).toBe(2);
    expect(body.items[1]).toMatchObject({
      amount: 100,
      status: "PAID",
      user: { id: buyer.id, username: "buyer", telegramId: String(buyer.telegramId) },
      product: { id: product.id, title: "Pro" },
    });
    const refunded = await http()
      .get("/api/admin/payments?status=REFUNDED")
      .set("Cookie", cookie)
      .expect(200);
    expect(refunded.body.total).toBe(1);
  });

  it("refunds Stars payments once", async () => {
    const buyer = await createUser(t);
    const payment = await createPayment(buyer.id, 50, { telegramPaymentChargeId: "stxCHARGE" });

    const { body } = await http()
      .post(`/api/admin/payments/${payment.id}/refund`)
      .set("Cookie", cookie)
      .expect(200);
    expect(body.status).toBe("REFUNDED");
    expect(body.refundedAt).toBeTruthy();
    expect(t.api.callsTo("refundStarPayment")[0]?.payload).toEqual({
      user_id: Number(buyer.telegramId),
      telegram_payment_charge_id: "stxCHARGE",
    });

    await http().post(`/api/admin/payments/${payment.id}/refund`).set("Cookie", cookie).expect(409);
    await http().post("/api/admin/payments/nope/refund").set("Cookie", cookie).expect(404);
    expect(t.api.callsTo("refundStarPayment")).toHaveLength(1);
  });

  it("keeps the payment PAID when Telegram refuses the refund", async () => {
    const buyer = await createUser(t);
    const payment = await createPayment(buyer.id, 50);
    t.api.fail("refundStarPayment", {
      error_code: 400,
      description: "Bad Request: CHARGE_ALREADY_REFUNDED",
    });
    const response = await http()
      .post(`/api/admin/payments/${payment.id}/refund`)
      .set("Cookie", cookie)
      .expect(502);
    expect(response.body.message).toBe(
      "Telegram refused the refund: Bad Request: CHARGE_ALREADY_REFUNDED",
    );
    const row = await t.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(row.status).toBe("PAID");
  });
});

describe("OpenAPI", () => {
  it("documents the admin API from the zod schemas", async () => {
    const { body } = await http().get("/api/docs-json").expect(200);
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining([
        "/api/auth/exchange",
        "/api/admin/stats",
        "/api/admin/users",
        "/api/admin/users/{id}",
        "/api/admin/products",
        "/api/admin/payments/{id}/refund",
      ]),
    );
    const createProduct = body.paths["/api/admin/products"].post;
    const schema = JSON.stringify(createProduct.requestBody);
    expect(schema).toContain("priceStars");
    expect(schema).toContain('"maxLength":32');
  });
});
