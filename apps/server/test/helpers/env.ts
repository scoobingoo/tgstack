import { type Env, parseEnv } from "../../src/config/env.js";

export const TEST_BOT_TOKEN = "123456:TEST-token_abcdefghijklmnopqrstuvwxyz";
export const TEST_JWT_SECRET = "test-secret-test-secret-test-secret-!!";

/** A valid environment pointing at the test database and Redis DB. */
export function createTestEnv(overrides: Record<string, string | undefined> = {}): Env {
  return parseEnv({
    NODE_ENV: "test",
    LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "silent",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15",
    BOT_TOKEN: TEST_BOT_TOKEN,
    JWT_SECRET: TEST_JWT_SECRET,
    ADMIN_URL: "http://localhost:3001",
    MINIAPP_URL: "http://localhost:5173",
    ...overrides,
  });
}
