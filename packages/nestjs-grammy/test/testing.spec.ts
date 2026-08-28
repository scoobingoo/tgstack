import { Api, Bot, GrammyError } from "grammy";
import { describe, expect, it } from "vitest";
import { createCommandUpdate, MockBotApi } from "../src/testing/index.js";

describe("MockBotApi", () => {
  it("answers HTTP requests through clientOptions, for any Api built from them", async () => {
    const mock = new MockBotApi();
    const bot = new Bot("1:TEST", { botInfo: mock.botInfo, client: mock.clientOptions });
    bot.command("start", (ctx) => ctx.reply("hi"));
    await bot.handleUpdate(createCommandUpdate("start"));

    // e.g. the conversations plugin creates such instances for every step
    const standalone = new Api("1:TEST", mock.clientOptions);
    const sent = await standalone.sendMessage(42, "from a fresh Api");

    expect(mock.callsTo("sendMessage").map((c) => c.payload.text)).toEqual([
      "hi",
      "from a fresh Api",
    ]);
    expect(sent.chat.id).toBe(42);
  });

  it("turns failures into GrammyErrors at both levels", async () => {
    const mock = new MockBotApi().fail("sendMessage", {
      error_code: 429,
      description: "Too Many Requests: retry after 3",
      parameters: { retry_after: 3 },
    });
    const viaFetch = new Api("1:TEST", mock.clientOptions);
    const viaTransformer = new Api("1:TEST");
    viaTransformer.config.use(mock.transformer);

    for (const api of [viaFetch, viaTransformer]) {
      const error = await api.sendMessage(1, "x").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GrammyError);
      expect((error as GrammyError).error_code).toBe(429);
      expect((error as GrammyError).parameters.retry_after).toBe(3);
    }
  });

  it("serves queued updates to getUpdates and overrides results", async () => {
    const mock = new MockBotApi().on("getChat", (payload) => ({
      id: payload.chat_id,
      type: "private",
    }));
    const api = new Api("1:TEST", mock.clientOptions);
    mock.pushUpdate(createCommandUpdate("start", "", { updateId: 5 }));
    expect((await api.getUpdates()).map((u) => u.update_id)).toEqual([5]);
    expect(await api.getChat(7)).toMatchObject({ id: 7 });
    mock.reset();
    expect(mock.calls).toEqual([]);
  });
});
