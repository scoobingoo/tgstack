import type { INestApplicationContext } from "@nestjs/common";
import type { User } from "@tgstack/db";
import { MockBotApi } from "@tgstack/nestjs-grammy/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminSession, createUser } from "./helpers/admin.js";
import { type BotTestApp, createBotTestApp, resetState } from "./helpers/bot-app.js";
import { createWorkerTestApp } from "./helpers/worker.js";

const DAY = 24 * 60 * 60 * 1000;

let t: BotTestApp;
let worker: INestApplicationContext;
const workerApi = new MockBotApi();
let cookie: string;

beforeAll(async () => {
  t = await createBotTestApp();
  ({ worker } = await createWorkerTestApp({
    api: workerApi,
    ratePerSecond: 30,
    concurrency: 4,
    schedulePollMs: 200,
  }));
});
beforeEach(async () => {
  await resetState(t);
  workerApi.reset();
  // The admin is blocked so it never counts as a recipient.
  ({ cookie } = await createAdminSession(t, { isBlocked: true }));
});
afterAll(async () => {
  await worker.close();
  await t.close();
});

const http = () => request(t.app.getHttpServer());

let chargeId = 0;
async function pay(user: User, status: "PAID" | "REFUNDED" = "PAID") {
  chargeId += 1;
  await t.prisma.payment.create({
    data: {
      userId: user.id,
      amount: 10,
      currency: "XTR",
      provider: "telegram-stars",
      telegramPaymentChargeId: `segment-${chargeId}`,
      invoicePayload: "test",
      status,
    },
  });
}

/** en: active buyer, en: dormant, vi: active, vi: dormant buyer (refunded only), blocked vi. */
async function seedAudience() {
  const now = Date.now();
  const enActiveBuyer = await createUser(t, { locale: "en", lastSeenAt: new Date(now - DAY) });
  const enDormant = await createUser(t, { locale: "en", lastSeenAt: new Date(now - 40 * DAY) });
  const viActive = await createUser(t, { locale: "vi", lastSeenAt: new Date(now - 2 * DAY) });
  const viDormantRefunded = await createUser(t, {
    locale: "vi",
    lastSeenAt: new Date(now - 60 * DAY),
  });
  await createUser(t, { locale: "vi", isBlocked: true });
  await pay(enActiveBuyer);
  await pay(viDormantRefunded, "REFUNDED");
  return { enActiveBuyer, enDormant, viActive, viDormantRefunded };
}

async function audience(segment: Record<string, unknown> | null): Promise<number> {
  const response = await http()
    .post("/api/admin/broadcasts/audience")
    .set("Cookie", cookie)
    .send({ segment })
    .expect(200);
  return response.body.count;
}

describe("segments", () => {
  it.each([
    ["everyone who did not block the bot", null, 4],
    ["an empty segment", {}, 4],
    ["one locale", { locales: ["vi"] }, 2],
    ["several locales", { locales: ["en", "vi"] }, 4],
    ["active within 7 days", { activeWithinDays: 7 }, 2],
    ["inactive for 30 days", { inactiveForDays: 30 }, 2],
    ["buyers (paid, not refunded)", { purchases: "buyers" }, 1],
    ["non-buyers", { purchases: "non-buyers" }, 3],
    ["combined: vi and inactive for 30 days", { locales: ["vi"], inactiveForDays: 30 }, 1],
    [
      "combined: en, active, buyers",
      { locales: ["en"], activeWithinDays: 7, purchases: "buyers" },
      1,
    ],
  ])("counts %s", async (_name, segment, expected) => {
    await seedAudience();
    expect(await audience(segment)).toBe(expected);
  });

  it.each([
    [{ locales: [] }],
    [{ locales: ["fr"] }],
    [{ activeWithinDays: 0 }],
    [{ activeWithinDays: 7, inactiveForDays: 30 }],
    [{ purchases: "some" }],
  ])("rejects an invalid segment %j", async (segment) => {
    await http()
      .post("/api/admin/broadcasts/audience")
      .set("Cookie", cookie)
      .send({ segment })
      .expect(400);
  });

  it("stores the segment on the draft; an empty one means everyone", async () => {
    const { body: draft } = await http()
      .post("/api/admin/broadcasts")
      .set("Cookie", cookie)
      .send({ text: "Xin chào", segment: { locales: ["vi"], purchases: "non-buyers" } })
      .expect(201);
    expect(draft.segment).toEqual({ locales: ["vi"], purchases: "non-buyers" });

    const { body: edited } = await http()
      .patch(`/api/admin/broadcasts/${draft.id}`)
      .set("Cookie", cookie)
      .send({ text: "Hello", segment: {} })
      .expect(200);
    expect(edited.segment).toBeNull();
  });

  it("sends only to the segment", async () => {
    const { viActive, viDormantRefunded } = await seedAudience();
    const { body: draft } = await http()
      .post("/api/admin/broadcasts")
      .set("Cookie", cookie)
      .send({ text: "Chỉ tiếng Việt", segment: { locales: ["vi"] } })
      .expect(201);
    await http().post(`/api/admin/broadcasts/${draft.id}/start`).set("Cookie", cookie).expect(200);

    const done = await vi.waitFor(
      async () => {
        const row = await t.prisma.broadcast.findUniqueOrThrow({ where: { id: draft.id } });
        if (row.status !== "COMPLETED") throw new Error(row.status);
        return row;
      },
      { timeout: 10_000, interval: 100 },
    );
    expect(done).toMatchObject({ total: 2, sent: 2, failed: 0 });
    const chats = workerApi.callsTo("sendMessage").map((call) => String(call.payload.chat_id));
    expect(chats.sort()).toEqual(
      [viActive.telegramId, viDormantRefunded.telegramId].map(String).sort(),
    );
  });
});

describe("scheduling", () => {
  const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

  async function draftId(): Promise<string> {
    const { body } = await http()
      .post("/api/admin/broadcasts")
      .set("Cookie", cookie)
      .send({ text: "Later" })
      .expect(201);
    return body.id;
  }

  it("schedules, reschedules and unschedules a draft", async () => {
    const id = await draftId();
    const first = inMinutes(30);
    const { body: scheduled } = await http()
      .post(`/api/admin/broadcasts/${id}/schedule`)
      .set("Cookie", cookie)
      .send({ scheduledAt: first })
      .expect(200);
    expect(scheduled).toMatchObject({ status: "SCHEDULED", scheduledAt: first });

    // Content is frozen while scheduled.
    await http()
      .patch(`/api/admin/broadcasts/${id}`)
      .set("Cookie", cookie)
      .send({ text: "Changed" })
      .expect(409);

    const later = inMinutes(90);
    const { body: moved } = await http()
      .post(`/api/admin/broadcasts/${id}/schedule`)
      .set("Cookie", cookie)
      .send({ scheduledAt: later })
      .expect(200);
    expect(moved.scheduledAt).toBe(later);

    const { body: draft } = await http()
      .post(`/api/admin/broadcasts/${id}/unschedule`)
      .set("Cookie", cookie)
      .expect(200);
    expect(draft).toMatchObject({ status: "DRAFT", scheduledAt: null });
  });

  it.each([
    ["in the past", () => new Date(Date.now() - 60_000).toISOString(), 400],
    ["less than a minute ahead", () => new Date(Date.now() + 10_000).toISOString(), 400],
    ["more than a year ahead", () => new Date(Date.now() + 400 * DAY).toISOString(), 400],
    ["without a time zone", () => "2030-01-01T09:00:00", 400],
  ])("rejects a time %s", async (_name, at, status) => {
    const id = await draftId();
    await http()
      .post(`/api/admin/broadcasts/${id}/schedule`)
      .set("Cookie", cookie)
      .send({ scheduledAt: at() })
      .expect(status);
  });

  it("refuses to schedule a broadcast that already started", async () => {
    const id = await draftId();
    await http().post(`/api/admin/broadcasts/${id}/start`).set("Cookie", cookie).expect(200);
    await http()
      .post(`/api/admin/broadcasts/${id}/schedule`)
      .set("Cookie", cookie)
      .send({ scheduledAt: inMinutes(30) })
      .expect(409);
  });

  it("the worker starts a scheduled broadcast when it is due", async () => {
    await seedAudience();
    const id = await draftId();
    await http()
      .post(`/api/admin/broadcasts/${id}/schedule`)
      .set("Cookie", cookie)
      .send({ scheduledAt: inMinutes(30) })
      .expect(200);

    // Not due yet: nothing happens.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect((await t.prisma.broadcast.findUniqueOrThrow({ where: { id } })).status).toBe(
      "SCHEDULED",
    );

    // Time passes.
    await t.prisma.broadcast.update({
      where: { id },
      data: { scheduledAt: new Date(Date.now() - 1_000) },
    });
    const done = await vi.waitFor(
      async () => {
        const row = await t.prisma.broadcast.findUniqueOrThrow({ where: { id } });
        if (row.status !== "COMPLETED") throw new Error(row.status);
        return row;
      },
      { timeout: 10_000, interval: 100 },
    );
    expect(done).toMatchObject({ total: 4, sent: 4 });
  });

  it("a cancelled or unscheduled broadcast is never started", async () => {
    await seedAudience();
    const cancelled = await draftId();
    const unscheduled = await draftId();
    for (const id of [cancelled, unscheduled]) {
      await http()
        .post(`/api/admin/broadcasts/${id}/schedule`)
        .set("Cookie", cookie)
        .send({ scheduledAt: inMinutes(30) })
        .expect(200);
    }
    await http()
      .post(`/api/admin/broadcasts/${cancelled}/cancel`)
      .set("Cookie", cookie)
      .expect(200);
    await http()
      .post(`/api/admin/broadcasts/${unscheduled}/unschedule`)
      .set("Cookie", cookie)
      .expect(200);
    await t.prisma.broadcast.updateMany({ data: { scheduledAt: new Date(Date.now() - 1_000) } });

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const rows = await t.prisma.broadcast.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((row) => row.status)).toEqual(["CANCELLED", "DRAFT"]);
    expect(workerApi.callsTo("sendMessage")).toHaveLength(0);
  });

  it("'send now' starts a scheduled broadcast immediately", async () => {
    await seedAudience();
    const id = await draftId();
    await http()
      .post(`/api/admin/broadcasts/${id}/schedule`)
      .set("Cookie", cookie)
      .send({ scheduledAt: inMinutes(30) })
      .expect(200);
    await http().post(`/api/admin/broadcasts/${id}/start`).set("Cookie", cookie).expect(200);
    await vi.waitFor(
      async () => {
        const row = await t.prisma.broadcast.findUniqueOrThrow({ where: { id } });
        if (row.status !== "COMPLETED") throw new Error(row.status);
      },
      { timeout: 10_000, interval: 100 },
    );
  });
});
