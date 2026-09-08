import { createHash } from "node:crypto";
import { createCommandUpdate } from "@tgstack/nestjs-grammy/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";
import { createAdminSession, createUser } from "./helpers/admin.js";
import { type BotTestApp, createBotTestApp, resetState, user } from "./helpers/bot-app.js";

let t: BotTestApp;

beforeAll(async () => {
  t = await createBotTestApp();
});
beforeEach(async () => {
  await resetState(t);
});
afterAll(async () => {
  await t.close();
});

const http = () => request(t.app.getHttpServer());

function tokenFrom(text: string): string {
  const match = /\/auth\/callback\?token=([\w-]+)/.exec(text);
  if (!match?.[1]) throw new Error(`No magic link in: ${text}`);
  return match[1];
}

describe("magic-link login", () => {
  it("logs an admin in from /admin to /me, then out", async () => {
    const admin = await createUser(t, { role: "ADMIN", firstName: "Grace" });
    const from = user({ id: Number(admin.telegramId), first_name: "Grace" });
    await t.send(createCommandUpdate("admin", "", { from }));

    const [reply] = t.api.callsTo("sendMessage");
    expect(reply?.payload.text).toContain("http://localhost:3001/auth/callback?token=");
    expect(reply?.payload.protect_content).toBe(true);
    const token = tokenFrom(String(reply?.payload.text));

    const exchange = await http().post("/api/auth/exchange").send({ token }).expect(200);
    expect(exchange.body.user).toMatchObject({
      id: admin.id,
      role: "ADMIN",
      telegramId: String(admin.telegramId),
    });
    const setCookie = String(exchange.headers["set-cookie"]);
    expect(setCookie).toMatch(/^tgstack_session=/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("Secure"); // only in production
    const cookie = setCookie.split(";")[0] ?? "";

    const me = await http().get("/api/auth/me").set("Cookie", cookie).expect(200);
    expect(me.body.user.firstName).toBe("Grace");

    await http().post("/api/auth/logout").set("Cookie", cookie).expect(204);
    // The JWT is still well-formed, but its server-side session is gone.
    await http().get("/api/auth/me").set("Cookie", cookie).expect(401);
  });

  it("stores only a hash of the token, which cannot be reused", async () => {
    const admin = await createUser(t, { role: "ADMIN" });
    const url = await t.app.get(AuthService).createMagicLink(admin);
    const token = tokenFrom(url);
    const hash = createHash("sha256").update(token).digest("hex");
    expect(await t.redis.get(`auth:magic:${hash}`)).toBe(admin.id);
    expect(await t.redis.get(`auth:magic:${token}`)).toBeNull();
    expect(await t.redis.ttl(`auth:magic:${hash}`)).toBeLessThanOrEqual(300);

    await http().post("/api/auth/exchange").send({ token }).expect(200);
    const reused = await http().post("/api/auth/exchange").send({ token }).expect(401);
    expect(reused.body.message).toMatch(/invalid or has expired/);
  });

  it("rejects expired tokens", async () => {
    const admin = await createUser(t, { role: "ADMIN" });
    const token = tokenFrom(await t.app.get(AuthService).createMagicLink(admin));
    const hash = createHash("sha256").update(token).digest("hex");
    await t.redis.pexpire(`auth:magic:${hash}`, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await http().post("/api/auth/exchange").send({ token }).expect(401);
  });

  it("does not give non-admins a link", async () => {
    const regular = await createUser(t, { role: "USER" });
    await t.send(
      createCommandUpdate("admin", "", { from: user({ id: Number(regular.telegramId) }) }),
    );
    expect(t.texts()).toEqual(["⛔ You are not allowed to do that."]);
    expect(await t.redis.keys("auth:magic:*")).toEqual([]);
  });

  it("refuses to exchange a token of a user demoted after the link was sent", async () => {
    const admin = await createUser(t, { role: "ADMIN" });
    const token = tokenFrom(await t.app.get(AuthService).createMagicLink(admin));
    await t.prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    await http().post("/api/auth/exchange").send({ token }).expect(401);
  });

  it("validates the request body", async () => {
    const response = await http().post("/api/auth/exchange").send({ token: 42 }).expect(400);
    expect(response.body).toMatchObject({
      message: "Validation failed",
      issues: [{ path: "token" }],
    });
  });
});

describe("sessions", () => {
  it("requires a session cookie", async () => {
    await http().get("/api/auth/me").expect(401);
    await http().get("/api/auth/me").set("Cookie", "tgstack_session=garbage").expect(401);
  });

  it("rejects a tampered token", async () => {
    const { cookie } = await createAdminSession(t);
    const [name, jwt] = cookie.split("=") as [string, string];
    const [header, payload, signature] = jwt.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "someone-else", sid: "x" })).toString(
      "base64url",
    );
    await http()
      .get("/api/auth/me")
      .set("Cookie", `${name}=${header}.${forged}.${signature}`)
      .expect(401);
    expect(payload).toBeTruthy();
  });

  it("ends access when the admin is demoted", async () => {
    const { admin, cookie } = await createAdminSession(t);
    await http().get("/api/admin/stats").set("Cookie", cookie).expect(200);
    await t.prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
    await http().get("/api/admin/stats").set("Cookie", cookie).expect(403);
  });
});
