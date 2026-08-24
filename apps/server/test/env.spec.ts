import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "../src/config/env.js";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  BOT_TOKEN: "123456:ABC-def_ghi",
  JWT_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      BOT_MODE: "polling",
      BOT_AUTO_SET_WEBHOOK: false,
      ADMIN_TELEGRAM_IDS: [],
      INITDATA_MAX_AGE_SECONDS: 86_400,
      BROADCAST_RATE_PER_SECOND: 25,
    });
  });

  it("coerces numbers, booleans and Telegram ID lists", () => {
    const env = parseEnv({
      ...valid,
      PORT: "8080",
      BOT_AUTO_SET_WEBHOOK: "true",
      BOT_MODE: "webhook",
      BOT_WEBHOOK_URL: "https://bot.example.com",
      BOT_WEBHOOK_SECRET: "s3cret",
      ADMIN_TELEGRAM_IDS: "1, 9007199254740993",
    });
    expect(env.PORT).toBe(8080);
    expect(env.BOT_AUTO_SET_WEBHOOK).toBe(true);
    expect(env.ADMIN_TELEGRAM_IDS).toEqual([1n, 9_007_199_254_740_993n]);
  });

  it("treats empty values as unset", () => {
    expect(parseEnv({ ...valid, PORT: "", BOT_WEBHOOK_URL: "" }).PORT).toBe(3000);
  });

  it("lists every invalid variable in one readable error", () => {
    try {
      parseEnv({ DATABASE_URL: "mysql://nope", JWT_SECRET: "short", ADMIN_TELEGRAM_IDS: "12,abc" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const message = (error as Error).message;
      expect(message).toContain("Invalid environment variables:");
      expect(message).toContain("DATABASE_URL: must be a postgresql:// URL");
      expect(message).toContain("REDIS_URL:");
      expect(message).toContain("BOT_TOKEN: is required");
      expect(message).toContain("JWT_SECRET: must be at least 32 characters");
      expect(message).toContain('ADMIN_TELEGRAM_IDS: "abc" is not a numeric Telegram ID');
    }
  });

  it("requires a webhook secret (and URL when auto-setting) in webhook mode", () => {
    expect(() => parseEnv({ ...valid, BOT_MODE: "webhook", BOT_AUTO_SET_WEBHOOK: "true" })).toThrow(
      /BOT_WEBHOOK_SECRET: is required when BOT_MODE=webhook[\s\S]*BOT_WEBHOOK_URL: is required/,
    );
  });

  it("rejects malformed bot tokens and webhook secrets", () => {
    expect(() => parseEnv({ ...valid, BOT_TOKEN: "not-a-token" })).toThrow(/BOT_TOKEN/);
    expect(() => parseEnv({ ...valid, BOT_WEBHOOK_SECRET: "has spaces" })).toThrow(
      /BOT_WEBHOOK_SECRET/,
    );
  });
});
