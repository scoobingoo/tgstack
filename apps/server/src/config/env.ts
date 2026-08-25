import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const telegramIds = z
  .string()
  .default("")
  .transform((value, ctx) => {
    const ids: bigint[] = [];
    for (const part of value.split(",").map((p) => p.trim())) {
      if (part === "") continue;
      if (!/^\d+$/.test(part)) {
        ctx.addIssue({ code: "custom", message: `"${part}" is not a numeric Telegram ID` });
        return z.NEVER;
      }
      ids.push(BigInt(part));
    }
    return ids;
  });

/** Every environment variable the server and worker read. See .env.example. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgresql:// URL" }),
    REDIS_URL: z.url({ protocol: /^rediss?$/, error: "must be a redis:// URL" }),

    BOT_TOKEN: z
      .string({ error: "is required (get one from @BotFather)" })
      .regex(/^\d+:[\w-]+$/, "does not look like a bot token (123456:ABC-...)"),
    BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
    BOT_WEBHOOK_URL: z.url().optional(),
    BOT_WEBHOOK_SECRET: z
      .string()
      .regex(/^[\w-]{1,256}$/, "must be 1-256 characters of A-Z, a-z, 0-9, _ or -")
      .optional(),
    BOT_AUTO_SET_WEBHOOK: z.stringbool().default(false),

    ADMIN_TELEGRAM_IDS: telegramIds,
    JWT_SECRET: z
      .string({ error: "is required (try `openssl rand -hex 32`)" })
      .min(32, "must be at least 32 characters (try `openssl rand -hex 32`)"),
    ADMIN_URL: z.url().default("http://localhost:3001"),
    MINIAPP_URL: z.url().default("http://localhost:5173"),
    INITDATA_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(86_400),
    BROADCAST_RATE_PER_SECOND: z.coerce.number().int().min(1).max(30).default(25),
  })
  .superRefine((env, ctx) => {
    if (env.BOT_MODE !== "webhook") return;
    if (!env.BOT_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["BOT_WEBHOOK_SECRET"],
        message: "is required when BOT_MODE=webhook",
      });
    }
    if (env.BOT_AUTO_SET_WEBHOOK && !env.BOT_WEBHOOK_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["BOT_WEBHOOK_URL"],
        message: "is required when BOT_AUTO_SET_WEBHOOK=true",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid environment variables:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/** Validates raw variables; throws an {@link EnvValidationError} listing every problem. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  // Treat empty strings as unset so `FOO=` in a .env file falls back to the default.
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ""));
  const result = envSchema.safeParse(cleaned);
  if (result.success) return result.data;
  throw new EnvValidationError(
    result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  );
}

let loaded: Env | undefined;

/**
 * Loads `apps/server/.env` then the monorepo root `.env` (decision D11) into
 * `process.env` without overriding variables that are already set, then
 * validates. The result is cached for the process.
 */
export function loadEnv(): Env {
  if (loaded) return loaded;
  for (const file of ["../../.env", "../../../../.env"]) {
    const path = fileURLToPath(new URL(file, import.meta.url));
    if (existsSync(path)) process.loadEnvFile(path);
  }
  loaded = parseEnv(process.env);
  return loaded;
}
