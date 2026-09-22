import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { z } from "zod";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, "../..");

// Decision D11: one root .env; an app-local .env (loaded by Next itself) still wins.
const rootEnv = path.join(repoRoot, ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const envSchema = z.object({
  /** Where the tgstack server listens. `/api/*` is proxied there so the session cookie stays first-party. */
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:3000"),
  /** Bot username (without @), used for the "Open the bot" link on the login page. */
  NEXT_PUBLIC_BOT_USERNAME: z
    .string()
    .regex(/^[A-Za-z0-9_]{5,32}$/, "must be a Telegram username without @")
    .optional(),
});

const parsed = envSchema.safeParse(
  Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")),
);
if (!parsed.success) {
  const problems = parsed.error.issues.map(
    (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
  );
  throw new Error(`Invalid environment variables for apps/admin:\n${problems.join("\n")}`);
}
const env = parsed.data;

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_BOT_USERNAME: env.NEXT_PUBLIC_BOT_USERNAME ?? "",
  },
  // Same-origin API in development. In production the reverse proxy (Caddy) routes /api first.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${env.NEXT_PUBLIC_API_URL}/api/:path*` }];
  },
};

export default config;
