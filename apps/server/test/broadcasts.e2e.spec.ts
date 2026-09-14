import { ApiError } from "@tgstack/nestjs-grammy/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminSession } from "./helpers/admin.js";
import { type BotTestApp, createBotTestApp, resetState } from "./helpers/bot-app.js";

let t: BotTestApp;
let cookie: string;
let adminTelegramId: bigint;

beforeAll(async () => {
  t = await createBotTestApp();
});
beforeEach(async () => {
  await resetState(t);
  const session = await createAdminSession(t);
  cookie = session.cookie;
  adminTelegramId = session.admin.telegramId;
});
afterAll(async () => {
  await t.close();
});

const http = () => request(t.app.getHttpServer());

async function createDraft(body: Record<string, unknown> = { text: "<b>Hello</b> everyone" }) {
  const response = await http()
    .post("/api/admin/broadcasts")
    .set("Cookie", cookie)
    .send(body)
    .expect(201);
  return response.body as { id: string; status: string };
}

describe("drafts", () => {
  it("creates, edits and lists drafts", async () => {
    const draft = await createDraft({
      text: "Hi",
      buttonText: "Open",
      buttonUrl: "https://example.com",
    });
    expect(draft).toMatchObject({
      status: "DRAFT",
      total: 0,
      sent: 0,
      failed: 0,
      buttonText: "Open",
    });

    const edited = await http()
      .patch(`/api/admin/broadcasts/${draft.id}`)
      .set("Cookie", cookie)
      .send({ text: "Hi again", imageUrl: "https://example.com/a.png" })
      .expect(200);
    expect(edited.body).toMatchObject({
      text: "Hi again",
      imageUrl: "https://example.com/a.png",
      buttonText: null,
    });

    const list = await http().get("/api/admin/broadcasts").set("Cookie", cookie).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].author.firstName).toBe("Admin");
  });

  it("validates content", async () => {
    const response = await http()
      .post("/api/admin/broadcasts")
      .set("Cookie", cookie)
      .send({ text: "", buttonUrl: "javascript:alert(1)" })
      .expect(400);
    expect(response.body.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(["text", "buttonUrl"]),
    );
  });
});

describe("preview", () => {
  it("sends the message to the requesting admin only", async () => {
    const draft = await createDraft({
      text: "<b>Sale</b>",
      buttonText: "Shop",
      buttonUrl: "https://shop.example",
    });
    await http()
      .post(`/api/admin/broadcasts/${draft.id}/preview`)
      .set("Cookie", cookie)
      .expect(204);

    const calls = t.api.callsTo("sendMessage");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toMatchObject({
      chat_id: Number(adminTelegramId),
      text: "<b>Sale</b>",
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "Shop", url: "https://shop.example" }]] },
    });
  });

  it("sends photos with an HTML caption", async () => {
    const draft = await createDraft({ text: "Look", imageUrl: "https://example.com/p.jpg" });
    await http()
      .post(`/api/admin/broadcasts/${draft.id}/preview`)
      .set("Cookie", cookie)
      .expect(204);
    expect(t.api.callsTo("sendPhoto")[0]?.payload).toMatchObject({
      photo: "https://example.com/p.jpg",
      caption: "Look",
      parse_mode: "HTML",
    });
  });

  it("reports Telegram's parse errors", async () => {
    t.api.on(
      "sendMessage",
      () => new ApiError({ error_code: 400, description: "Bad Request: can't parse entities" }),
    );
    const draft = await createDraft({ text: "<b>unclosed" });
    const response = await http()
      .post(`/api/admin/broadcasts/${draft.id}/preview`)
      .set("Cookie", cookie)
      .expect(400);
    expect(response.body.message).toBe(
      "Telegram refused the message: Bad Request: can't parse entities",
    );
  });
});

describe("state transitions", () => {
  it("starts a draft once", async () => {
    const draft = await createDraft();
    const started = await http()
      .post(`/api/admin/broadcasts/${draft.id}/start`)
      .set("Cookie", cookie)
      .expect(200);
    expect(started.body.status).toBe("QUEUED");
    expect(await t.redis.keys("bull:broadcast-control:start-*")).toHaveLength(1);

    const again = await http()
      .post(`/api/admin/broadcasts/${draft.id}/start`)
      .set("Cookie", cookie)
      .expect(409);
    expect(again.body.message).toBe("Cannot start a queued broadcast");
    await http()
      .patch(`/api/admin/broadcasts/${draft.id}`)
      .set("Cookie", cookie)
      .send({ text: "too late" })
      .expect(409);
  });

  it("cancels drafts and queued broadcasts, but not finished ones", async () => {
    const draft = await createDraft();
    const cancelled = await http()
      .post(`/api/admin/broadcasts/${draft.id}/cancel`)
      .set("Cookie", cookie)
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: "CANCELLED" });
    expect(cancelled.body.finishedAt).toBeTruthy();
    await http().post(`/api/admin/broadcasts/${draft.id}/cancel`).set("Cookie", cookie).expect(409);
    await http().post(`/api/admin/broadcasts/${draft.id}/start`).set("Cookie", cookie).expect(409);

    const queued = await createDraft();
    await http().post(`/api/admin/broadcasts/${queued.id}/start`).set("Cookie", cookie).expect(200);
    await http()
      .post(`/api/admin/broadcasts/${queued.id}/cancel`)
      .set("Cookie", cookie)
      .expect(200);
  });

  it("cannot start a completed broadcast", async () => {
    const draft = await createDraft();
    await t.prisma.broadcast.update({ where: { id: draft.id }, data: { status: "COMPLETED" } });
    const response = await http()
      .post(`/api/admin/broadcasts/${draft.id}/start`)
      .set("Cookie", cookie)
      .expect(409);
    expect(response.body.message).toBe("Cannot start a completed broadcast");
    await http().post(`/api/admin/broadcasts/${draft.id}/cancel`).set("Cookie", cookie).expect(409);
  });

  it("returns 404 for unknown broadcasts", async () => {
    for (const action of ["start", "cancel", "preview"]) {
      await http().post(`/api/admin/broadcasts/nope/${action}`).set("Cookie", cookie).expect(404);
    }
    await http().get("/api/admin/broadcasts/nope").set("Cookie", cookie).expect(404);
  });
});

describe("progress events (SSE)", () => {
  it("streams progress and ends after a terminal status", async () => {
    const draft = await createDraft();
    await t.prisma.broadcast.update({
      where: { id: draft.id },
      data: { status: "COMPLETED", total: 3, sent: 2, failed: 1, finishedAt: new Date() },
    });
    const response = await http()
      .get(`/api/admin/broadcasts/${draft.id}/events`)
      .set("Cookie", cookie)
      .buffer(true)
      .parse((res, done) => {
        let text = "";
        res.on("data", (chunk: Buffer) => {
          text += chunk.toString();
        });
        res.on("end", () => done(null, text));
      })
      .expect(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    const events = String(response.body)
      .split("\n\n")
      .filter((block) => block.includes("data:"));
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("event: progress");
    const data = JSON.parse(events[0]?.split("data: ")[1] ?? "{}");
    expect(data).toMatchObject({ id: draft.id, status: "COMPLETED", total: 3, sent: 2, failed: 1 });
  });

  it("requires an admin session", async () => {
    await http().get("/api/admin/broadcasts/x/events").expect(401);
  });
});
