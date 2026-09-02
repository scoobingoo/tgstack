import {
  ApiError,
  createCallbackQueryUpdate,
  createCommandUpdate,
  createTextUpdate,
  MockBotApi,
} from "@tgstack/nestjs-grammy/testing";
import type { Update } from "grammy/types";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type BotTestApp, createBotTestApp, resetState, user } from "./helpers/bot-app.js";

const ada = user({ id: 100_000_001, first_name: "Ada <script>", language_code: "en" });
const linh = user({ id: 100_000_002, first_name: "Linh", username: "linh", language_code: "vi" });

describe("bot (polling-style updates)", () => {
  let t: BotTestApp;

  beforeAll(async () => {
    t = await createBotTestApp({ env: { ADMIN_TELEGRAM_IDS: "999" } });
  });
  beforeEach(async () => {
    await resetState(t);
  });
  afterAll(async () => {
    await t.close();
  });

  describe("/start", () => {
    it("creates the user and greets them with an escaped name", async () => {
      await t.send(createCommandUpdate("start", "", { from: ada }));

      const row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(ada.id) } });
      expect(row).toMatchObject({
        firstName: "Ada <script>",
        username: "ada",
        languageCode: "en",
        locale: "en",
        role: "USER",
        isBlocked: false,
      });

      const [reply] = t.api.callsTo("sendMessage");
      expect(reply?.payload.text).toContain("Hi, <b>Ada &lt;script&gt;</b>!");
      expect(reply?.payload.parse_mode).toBe("HTML");
      // MINIAPP_URL is http:// in tests, and Telegram only accepts HTTPS Web App buttons.
      expect(reply?.payload.reply_markup).toBeUndefined();
    });

    it("negotiates the locale from Telegram's language_code for new users", async () => {
      await t.send(createCommandUpdate("start", "", { from: linh }));
      const row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(linh.id) } });
      expect(row.locale).toBe("vi");
      expect(t.texts()[0]).toContain("Chào <b>Linh</b>!");
    });

    it("refreshes the profile and lastSeenAt on every update", async () => {
      await t.send(createCommandUpdate("start", "", { from: ada }));
      const first = await t.prisma.user.findUniqueOrThrow({
        where: { telegramId: BigInt(ada.id) },
      });
      await t.send(createCommandUpdate("help", "", { from: { ...ada, username: "ada_renamed" } }));
      const second = await t.prisma.user.findUniqueOrThrow({
        where: { telegramId: BigInt(ada.id) },
      });
      expect(second.username).toBe("ada_renamed");
      expect(second.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first.lastSeenAt.getTime());
      expect(await t.prisma.user.count()).toBe(1);
    });

    it("creates users listed in ADMIN_TELEGRAM_IDS as admins", async () => {
      await t.send(createCommandUpdate("start", "", { from: user({ id: 999 }) }));
      const row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: 999n } });
      expect(row.role).toBe("ADMIN");
    });

    it("keeps a per-chat session in Redis", async () => {
      await t.send(createCommandUpdate("start", "", { from: ada }));
      await t.send(createCommandUpdate("start", "", { from: ada }));
      const stored = await t.redis.get(`bot:session:${ada.id}`);
      expect(JSON.parse(stored ?? "{}")).toEqual({ startCount: 2 });
    });
  });

  describe("/language", () => {
    it("persists the choice and switches every later reply", async () => {
      await t.send(createCommandUpdate("language", "", { from: ada }));
      const keyboard = t.api.callsTo("sendMessage")[0]?.payload.reply_markup;
      expect(
        keyboard.inline_keyboard[0].map((b: { callback_data: string }) => b.callback_data),
      ).toEqual(["lang:en", "lang:vi"]);

      await t.send(createCallbackQueryUpdate("lang:vi", { from: ada }));
      expect(t.api.callsTo("answerCallbackQuery")).toHaveLength(1);
      expect(t.api.callsTo("editMessageText")[0]?.payload.text).toBe(
        "✅ Đã chuyển sang tiếng Việt.",
      );

      const row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(ada.id) } });
      expect(row.locale).toBe("vi");

      await t.send(createCommandUpdate("help", "", { from: ada }));
      expect(t.texts().at(-1)).toContain("<b>Lệnh</b>");
    });

    it("ignores unsupported locales", async () => {
      await t.send(createCallbackQueryUpdate("lang:xx", { from: ada }));
      expect(t.api.callsTo("answerCallbackQuery")).toHaveLength(1);
      expect(t.api.callsTo("editMessageText")).toHaveLength(0);
    });
  });

  describe("blocked users", () => {
    const memberUpdate = (status: "kicked" | "member"): Update => ({
      update_id: Date.now(),
      my_chat_member: {
        chat: { id: ada.id, type: "private", first_name: ada.first_name },
        from: ada,
        date: Math.floor(Date.now() / 1000),
        old_chat_member: { status: "member", user: t.api.botInfo },
        new_chat_member:
          status === "kicked"
            ? { status: "kicked", user: t.api.botInfo, until_date: 0 }
            : { status: "member", user: t.api.botInfo },
      },
    });

    it("flags users who block the bot and clears the flag when they come back", async () => {
      await t.send(createCommandUpdate("start", "", { from: ada }));
      await t.send(memberUpdate("kicked"));
      let row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(ada.id) } });
      expect(row.isBlocked).toBe(true);

      await t.send(memberUpdate("member"));
      row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(ada.id) } });
      expect(row.isBlocked).toBe(false);
    });
  });

  describe("/cancel", () => {
    it("says there is nothing to cancel outside a conversation", async () => {
      await t.send(createCommandUpdate("cancel", "", { from: ada }));
      expect(t.texts()).toEqual(["There is nothing to cancel."]);
    });
  });

  describe("errors", () => {
    it("answers with a generic error message when a handler fails", async () => {
      // The /help reply fails (400 is not retried); the error reply goes through.
      t.api.on("sendMessage", (payload) =>
        String(payload.text).startsWith("😕")
          ? { message_id: 1, date: 0, chat: { id: ada.id, type: "private" }, text: payload.text }
          : new ApiError({ error_code: 400, description: "Bad Request: boom" }),
      );
      await t.send(createCommandUpdate("help", "", { from: ada }));
      expect(t.texts().at(-1)).toBe("😕 Something went wrong. Please try again later.");
    });
  });
});

describe("onboarding wizard (EXAMPLE)", () => {
  let t: BotTestApp;
  const api = new MockBotApi();

  beforeEach(async () => {
    t = await createBotTestApp({ api });
    await resetState(t);
  });
  afterAll(async () => {
    await t.close();
  });

  it("collects answers across a server restart and saves them", async () => {
    await t.send(createCommandUpdate("onboarding", "", { from: ada }));
    expect(t.texts().at(-1)).toContain("What should I call you?");

    await t.send(createTextUpdate("/help", { from: ada })); // commands are not names
    expect(t.texts().at(-1)).toContain("1 to 64 characters");

    await t.send(createTextUpdate("Ada", { from: ada }));
    expect(t.texts().at(-1)).toContain("Nice to meet you, <b>Ada</b>!");

    // Restart: a brand-new app instance, same Redis.
    await t.close();
    t = await createBotTestApp({ api });

    await t.send(createCallbackQueryUpdate("onboarding:interest:deals", { from: ada }));
    expect(t.texts().at(-1)).toContain("Interest: <b>🏷 Deals</b>");

    await t.send(createCallbackQueryUpdate("onboarding:confirm:yes", { from: ada }));
    expect(t.texts().at(-1)).toBe("🎉 All set, Ada! Your profile has been saved.");

    const row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(ada.id) } });
    expect(row.onboarding).toMatchObject({ name: "Ada", interest: "deals" });
  });

  it("can start over and be cancelled cleanly", async () => {
    await t.send(createCommandUpdate("onboarding", "", { from: ada }));
    await t.send(createTextUpdate("Ada", { from: ada }));
    await t.send(createCallbackQueryUpdate("onboarding:interest:news", { from: ada }));
    await t.send(createCallbackQueryUpdate("onboarding:confirm:no", { from: ada }));
    expect(t.texts().slice(-2)).toEqual([
      "No problem, let's start over.",
      "What should I call you? Send me your name, or /cancel.",
    ]);

    await t.send(createCommandUpdate("cancel", "", { from: ada }));
    expect(t.texts().at(-1)).toBe("Cancelled.");

    // The wizard is gone: plain text no longer gets an onboarding answer.
    const before = t.texts().length;
    await t.send(createTextUpdate("Bob", { from: ada }));
    expect(t.texts()).toHaveLength(before);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { telegramId: BigInt(ada.id) } });
    expect(row.onboarding).toBeNull();
  });
});

describe("boot", () => {
  it("publishes per-locale command menus and an admin menu", async () => {
    const t = await createBotTestApp({ env: { ADMIN_TELEGRAM_IDS: "999" } });
    const calls = t.api.callsTo("setMyCommands");
    expect(calls.map((c) => [c.payload.language_code, c.payload.scope?.chat_id])).toEqual([
      [undefined, undefined],
      [undefined, 999],
      ["vi", undefined],
      ["vi", 999],
    ]);
    const publicCommands = calls[0]?.payload.commands.map((c: { command: string }) => c.command);
    expect(publicCommands).toEqual(["start", "help", "language", "onboarding", "cancel"]);
    expect(calls[2]?.payload.commands[1]).toEqual({ command: "help", description: "Xem trợ giúp" });
    // http:// Mini App URL → no menu button.
    expect(t.api.callsTo("setChatMenuButton")).toHaveLength(0);
    await t.close();
  });

  it("promotes existing users listed in ADMIN_TELEGRAM_IDS", async () => {
    const t = await createBotTestApp();
    await resetState(t);
    await t.prisma.user.create({ data: { telegramId: 4242n, firstName: "Future admin" } });
    await t.close();

    const restarted = await createBotTestApp({ env: { ADMIN_TELEGRAM_IDS: "4242" } });
    const row = await restarted.prisma.user.findUniqueOrThrow({ where: { telegramId: 4242n } });
    expect(row.role).toBe("ADMIN");
    await restarted.close();
  });
});

describe("webhook mode", () => {
  const secret = "test_webhook-secret";

  it("rejects requests without the secret token and processes valid updates", async () => {
    const t = await createBotTestApp({
      mode: "webhook",
      env: {
        BOT_MODE: "webhook",
        BOT_WEBHOOK_SECRET: secret,
        BOT_WEBHOOK_URL: "https://bot.example.com/",
        BOT_AUTO_SET_WEBHOOK: "true",
      },
    });
    await resetState(t);
    const server = t.app.getHttpServer();
    const update = createCommandUpdate("start", "", { from: ada });

    await request(server).post("/telegram/webhook").send(update).expect(401);
    await request(server)
      .post("/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", "nope")
      .send(update)
      .expect(401);
    expect(await t.prisma.user.count()).toBe(0);

    await request(server)
      .post("/telegram/webhook")
      .set("X-Telegram-Bot-Api-Secret-Token", secret)
      .send(update)
      .expect(200);
    expect(await t.prisma.user.count()).toBe(1);
    expect(t.texts()[0]).toContain("Hi, <b>Ada &lt;script&gt;</b>!");
    await t.close();
  });

  it("calls setWebhook with the secret and allowed updates on boot", async () => {
    const t = await createBotTestApp({
      mode: "webhook",
      env: {
        BOT_MODE: "webhook",
        BOT_WEBHOOK_SECRET: secret,
        BOT_WEBHOOK_URL: "https://bot.example.com/",
        BOT_AUTO_SET_WEBHOOK: "true",
      },
    });
    expect(t.api.callsTo("setWebhook")[0]?.payload).toEqual({
      url: "https://bot.example.com/telegram/webhook",
      secret_token: secret,
      allowed_updates: [
        "message",
        "edited_message",
        "callback_query",
        "inline_query",
        "pre_checkout_query",
        "my_chat_member",
      ],
    });
    await t.close();
  });
});
