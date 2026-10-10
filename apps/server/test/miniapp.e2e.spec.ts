import { SUPPORTED_LOCALES } from "@tgstack/i18n";
import { createCommandUpdate } from "@tgstack/nestjs-grammy/testing";
import { signInitData, updateAppMeSchema } from "@tgstack/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InvoicePayloadSigner } from "../src/modules/payments/invoice-payload.js";
import { type BotTestApp, createBotTestApp, resetState, user } from "./helpers/bot-app.js";
import { TEST_BOT_TOKEN, TEST_JWT_SECRET } from "./helpers/env.js";

let t: BotTestApp;
const telegramUser = { id: 300_000_001, first_name: "Mai", username: "mai", language_code: "vi" };

beforeAll(async () => {
  t = await createBotTestApp({ env: { INITDATA_MAX_AGE_SECONDS: "3600" } });
});
beforeEach(async () => {
  await resetState(t);
});
afterAll(async () => {
  await t.close();
});

const http = () => request(t.app.getHttpServer());

async function initData(overrides: Record<string, unknown> = {}, token = TEST_BOT_TOKEN) {
  return signInitData(
    { auth_date: Math.floor(Date.now() / 1000), query_id: "AAQ", user: telegramUser, ...overrides },
    token,
  );
}

async function tma(overrides: Record<string, unknown> = {}) {
  return `tma ${await initData(overrides)}`;
}

describe("Mini App authentication", () => {
  it("rejects requests without valid initData", async () => {
    await http().get("/api/app/me").expect(401);
    await http().get("/api/app/me").set("Authorization", "Bearer something").expect(401);

    const forged = (await initData()).replace("Mai", "Eve");
    const tampered = await http()
      .get("/api/app/me")
      .set("Authorization", `tma ${forged}`)
      .expect(401);
    expect(tampered.body.message).toBe("Invalid init data (invalid-hash)");

    const otherBot = await initData({}, "999:another-bot-token");
    await http().get("/api/app/me").set("Authorization", `tma ${otherBot}`).expect(401);

    const old = await tma({ auth_date: Math.floor(Date.now() / 1000) - 7200 });
    const expired = await http().get("/api/app/me").set("Authorization", old).expect(401);
    expect(expired.body.message).toBe("Invalid init data (expired)");

    const noUser = `tma ${await signInitData({ auth_date: Math.floor(Date.now() / 1000) }, TEST_BOT_TOKEN)}`;
    await http().get("/api/app/me").set("Authorization", noUser).expect(401);
    expect(await t.prisma.user.count()).toBe(0);
  });

  it("creates the user from verified initData only", async () => {
    const { body } = await http()
      .get("/api/app/me")
      .set("Authorization", await tma())
      .expect(200);
    expect(body).toMatchObject({
      telegramId: "300000001",
      firstName: "Mai",
      username: "mai",
      locale: "vi",
    });
    const row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: 300_000_001n } });
    expect(row.languageCode).toBe("vi");
  });
});

describe("PATCH /api/app/me", () => {
  it("switches the locale used by the bot", async () => {
    const auth = await tma();
    const { body } = await http()
      .patch("/api/app/me")
      .set("Authorization", auth)
      .send({ locale: "en" })
      .expect(200);
    expect(body.locale).toBe("en");

    await t.send(createCommandUpdate("help", "", { from: user(telegramUser) }));
    expect(t.texts().at(-1)).toContain("<b>Commands</b>");

    await http().patch("/api/app/me").set("Authorization", auth).send({ locale: "vi" }).expect(200);
    await t.send(createCommandUpdate("help", "", { from: user(telegramUser) }));
    expect(t.texts().at(-1)).toContain("<b>Lệnh</b>");
  });

  it("only accepts supported locales", async () => {
    await http()
      .patch("/api/app/me")
      .set("Authorization", await tma())
      .send({ locale: "fr" })
      .expect(400);
    expect(updateAppMeSchema.shape.locale.options).toEqual([...SUPPORTED_LOCALES]);
  });
});

describe("shop (EXAMPLE)", () => {
  async function seedProducts() {
    const [cheap, pricey] = await Promise.all([
      t.prisma.product.create({
        data: { title: "Sticker", description: "One sticker", priceStars: 5 },
      }),
      t.prisma.product.create({
        data: {
          title: "Pro",
          description: "Pro plan",
          priceStars: 100,
          imageUrl: "https://example.com/pro.png",
        },
      }),
      t.prisma.product.create({
        data: { title: "Old", description: "Gone", priceStars: 1, isActive: false },
      }),
    ]);
    return { cheap, pricey };
  }

  it("lists active products, cheapest first", async () => {
    await seedProducts();
    const { body } = await http()
      .get("/api/app/products")
      .set("Authorization", await tma())
      .expect(200);
    expect(body.map((p: { title: string }) => p.title)).toEqual(["Sticker", "Pro"]);
  });

  it("creates a Telegram Stars invoice link", async () => {
    const { pricey } = await seedProducts();
    t.api.on("createInvoiceLink", () => "https://t.me/$invoice-for-tests");
    const { body } = await http()
      .post(`/api/app/products/${pricey.id}/invoice`)
      .set("Authorization", await tma())
      .expect(201);
    expect(body).toEqual({ url: "https://t.me/$invoice-for-tests" });

    const [call] = t.api.callsTo("createInvoiceLink");
    expect(call?.payload).toMatchObject({
      title: "Pro",
      description: "Pro plan",
      provider_token: "",
      currency: "XTR",
      prices: [{ label: "Pro", amount: 100 }],
      photo_url: "https://example.com/pro.png",
    });
    const buyer = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: 300_000_001n } });
    const payload = new InvoicePayloadSigner(TEST_JWT_SECRET).verify(call?.payload.payload);
    expect(payload).toMatchObject({ productId: pricey.id, userId: buyer.id });
    expect(Buffer.byteLength(call?.payload.payload)).toBeLessThanOrEqual(128);
  });

  it("refuses inactive or unknown products", async () => {
    await seedProducts();
    const inactive = await t.prisma.product.findFirstOrThrow({ where: { isActive: false } });
    await http()
      .post(`/api/app/products/${inactive.id}/invoice`)
      .set("Authorization", await tma())
      .expect(404);
    await http()
      .post("/api/app/products/nope/invoice")
      .set("Authorization", await tma())
      .expect(404);
    await http().post("/api/app/products/nope/invoice").expect(401);
  });
});
