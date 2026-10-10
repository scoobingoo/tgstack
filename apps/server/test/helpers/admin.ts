import type { User } from "@tgstack/db";
import { SESSION_COOKIE } from "@tgstack/shared";
import { AuthService } from "../../src/modules/auth/auth.service.js";
import type { BotTestApp } from "./bot-app.js";

let nextTelegramId = 500_000_000n;

/** Creates a user row directly (no bot round-trip). */
export function createUser(t: BotTestApp, data: Partial<User> = {}): Promise<User> {
  nextTelegramId += 1n;
  return t.prisma.user.create({
    data: {
      telegramId: data.telegramId ?? nextTelegramId,
      firstName: data.firstName ?? "Test",
      username: data.username ?? null,
      role: data.role ?? "USER",
      isBlocked: data.isBlocked ?? false,
      locale: data.locale ?? "en",
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      ...(data.lastSeenAt ? { lastSeenAt: data.lastSeenAt } : {}),
    },
  });
}

/** Signs in an admin the same way the dashboard does and returns the `Cookie` header. */
export async function loginAs(t: BotTestApp, user: User): Promise<string> {
  const session = await t.app.get(AuthService).createSession(user);
  return `${SESSION_COOKIE}=${session.token}`;
}

export async function createAdminSession(
  t: BotTestApp,
  data: Partial<User> = {},
): Promise<{ admin: User; cookie: string }> {
  const admin = await createUser(t, { firstName: "Admin", ...data, role: "ADMIN" });
  return { admin, cookie: await loginAs(t, admin) };
}
