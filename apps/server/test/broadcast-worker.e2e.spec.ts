import { statSync } from "node:fs";
import type { INestApplicationContext } from "@nestjs/common";
import { ApiError, MockBotApi } from "@tgstack/nestjs-grammy/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { QueueFactory } from "../src/infra/queue/queue.module.js";
import { BROADCAST_MESSAGE_QUEUE } from "../src/modules/broadcasts/broadcast-queues.js";
import { WorkerHeartbeat } from "../src/worker-heartbeat.js";
import { createAdminSession } from "./helpers/admin.js";
import { type BotTestApp, createBotTestApp, resetState } from "./helpers/bot-app.js";
import { createWorkerTestApp } from "./helpers/worker.js";

const RECIPIENTS = 1_000;
const RATE_PER_SECOND = 100;
const FIRST_TELEGRAM_ID = 800_000_000n;

let t: BotTestApp;
let worker: INestApplicationContext;
let heartbeatFile: string;
const workerApi = new MockBotApi();

beforeAll(async () => {
  t = await createBotTestApp();
  await resetState(t);
  ({ worker, heartbeatFile } = await createWorkerTestApp({
    api: workerApi,
    ratePerSecond: RATE_PER_SECOND,
    concurrency: 8,
  }));
});
afterAll(async () => {
  await worker.close();
  await t.close();
});

async function seedRecipients(count: number, firstId: bigint) {
  await t.prisma.user.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      telegramId: firstId + BigInt(i),
      firstName: `User ${i}`,
    })),
  });
}

async function waitForStatus(id: string, statuses: string[], timeoutMs: number) {
  return vi.waitFor(
    async () => {
      const broadcast = await t.prisma.broadcast.findUniqueOrThrow({ where: { id } });
      if (!statuses.includes(broadcast.status)) throw new Error(`still ${broadcast.status}`);
      return broadcast;
    },
    { timeout: timeoutMs, interval: 200 },
  );
}

/** Largest number of calls inside any sliding window of `windowMs`. */
function maxInWindow(timestamps: number[], windowMs: number): number {
  const sorted = [...timestamps].sort((a, b) => a - b);
  let max = 0;
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while ((sorted[end] ?? 0) - (sorted[start] ?? 0) >= windowMs) start++;
    max = Math.max(max, end - start + 1);
  }
  return max;
}

describe("broadcast worker", () => {
  it("writes a liveness heartbeat for the container healthcheck", async () => {
    expect(Date.now() - statSync(heartbeatFile).mtimeMs).toBeLessThan(15_000);
    expect(await worker.get(WorkerHeartbeat).beat()).toBe(true);
  });

  it("delivers to 1,000 users within the rate limit, honouring 429 and 403", async () => {
    const { admin, cookie } = await createAdminSession(t);
    await t.prisma.user.update({ where: { id: admin.id }, data: { isBlocked: true } }); // keep the admin out
    await seedRecipients(RECIPIENTS, FIRST_TELEGRAM_ID);

    // Every 10th user has blocked the bot; Telegram throttles us twice.
    const isBlockedChat = (chatId: number) => (BigInt(chatId) - FIRST_TELEGRAM_ID) % 10n === 0n;
    const throttleAt = new Set([150, 600]);
    let callCount = 0;
    const delivered = new Map<number, number>();
    workerApi.on("sendMessage", (payload) => {
      callCount += 1;
      const chatId = Number(payload.chat_id);
      if (throttleAt.has(callCount)) {
        return new ApiError({
          error_code: 429,
          description: "Too Many Requests: retry after 1",
          parameters: { retry_after: 1 },
        });
      }
      if (isBlockedChat(chatId)) {
        return new ApiError({
          error_code: 403,
          description: "Forbidden: bot was blocked by the user",
        });
      }
      delivered.set(chatId, (delivered.get(chatId) ?? 0) + 1);
      return {
        message_id: callCount,
        date: 0,
        chat: { id: chatId, type: "private" },
        text: payload.text,
      };
    });

    const { body: draft } = await request(t.app.getHttpServer())
      .post("/api/admin/broadcasts")
      .set("Cookie", cookie)
      .send({ text: "<b>Big news</b>", buttonText: "Read", buttonUrl: "https://example.com" })
      .expect(201);
    await request(t.app.getHttpServer())
      .post(`/api/admin/broadcasts/${draft.id}/start`)
      .set("Cookie", cookie)
      .expect(200);

    const done = await waitForStatus(draft.id, ["COMPLETED"], 60_000);

    // Counters: 100 blocked users failed, everyone else got exactly one message.
    expect(done).toMatchObject({ total: RECIPIENTS, sent: 900, failed: 100, status: "COMPLETED" });
    expect(done.startedAt).toBeTruthy();
    expect(done.finishedAt).toBeTruthy();
    expect(delivered.size).toBe(900);
    expect([...delivered.values()].every((count) => count === 1)).toBe(true);

    // Blocked users are flagged and will be skipped by the next broadcast.
    const blocked = await t.prisma.user.findMany({
      where: { isBlocked: true, telegramId: { gte: FIRST_TELEGRAM_ID } },
      select: { telegramId: true },
    });
    expect(blocked).toHaveLength(100);
    expect(blocked.every((u) => isBlockedChat(Number(u.telegramId)))).toBe(true);

    // Throughput: every call (including throttled/blocked ones) respects the limiter.
    const sendTimes = workerApi.callsTo("sendMessage").map((call) => call.at);
    expect(sendTimes).toHaveLength(RECIPIENTS + throttleAt.size);
    expect(maxInWindow(sendTimes, 1_000)).toBeLessThanOrEqual(RATE_PER_SECOND);
    // Two 429s with retry_after=1 paused the queue for about a second each.
    const elapsed = (done.finishedAt?.getTime() ?? 0) - (done.startedAt?.getTime() ?? 0);
    expect(elapsed).toBeGreaterThanOrEqual((RECIPIENTS / RATE_PER_SECOND) * 1_000);
  }, 90_000);

  it("stops sending after a cancel", async () => {
    await resetState(t);
    workerApi.reset();
    const { admin, cookie } = await createAdminSession(t);
    await t.prisma.user.update({ where: { id: admin.id }, data: { isBlocked: true } });
    await seedRecipients(400, 900_000_000n);

    const http = request(t.app.getHttpServer());
    const { body: draft } = await http
      .post("/api/admin/broadcasts")
      .set("Cookie", cookie)
      .send({ text: "Soon cancelled" })
      .expect(201);
    await request(t.app.getHttpServer())
      .post(`/api/admin/broadcasts/${draft.id}/start`)
      .set("Cookie", cookie)
      .expect(200);

    await waitForStatus(draft.id, ["RUNNING"], 10_000);
    await vi.waitFor(() => expect(workerApi.callsTo("sendMessage").length).toBeGreaterThan(20), {
      timeout: 10_000,
    });
    await request(t.app.getHttpServer())
      .post(`/api/admin/broadcasts/${draft.id}/cancel`)
      .set("Cookie", cookie)
      .expect(200);

    // The waiting messages are removed at once, not left to trickle through the
    // rate limiter (draining ~370 of them at 100/s would take several seconds).
    const queue = worker.get(QueueFactory).createQueue(BROADCAST_MESSAGE_QUEUE);
    try {
      await vi.waitFor(
        async () =>
          expect(await queue.getJobCountByTypes("waiting", "delayed", "prioritized")).toBe(0),
        { timeout: 1_000, interval: 50 },
      );
    } finally {
      await queue.close();
    }

    // The worker re-reads the status at least every second.
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const sentAfterCancel = workerApi.callsTo("sendMessage").length;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(workerApi.callsTo("sendMessage").length).toBe(sentAfterCancel);
    expect(sentAfterCancel).toBeLessThan(400);

    const row = await t.prisma.broadcast.findUniqueOrThrow({ where: { id: draft.id } });
    expect(row.status).toBe("CANCELLED");
  }, 60_000);

  it("completes immediately when there is nobody to send to", async () => {
    await resetState(t);
    const { admin, cookie } = await createAdminSession(t);
    await t.prisma.user.update({ where: { id: admin.id }, data: { isBlocked: true } });
    const { body: draft } = await request(t.app.getHttpServer())
      .post("/api/admin/broadcasts")
      .set("Cookie", cookie)
      .send({ text: "Anyone?" })
      .expect(201);
    await request(t.app.getHttpServer())
      .post(`/api/admin/broadcasts/${draft.id}/start`)
      .set("Cookie", cookie)
      .expect(200);
    const done = await waitForStatus(draft.id, ["COMPLETED"], 10_000);
    expect(done).toMatchObject({ total: 0, sent: 0, failed: 0 });
  });
});
