import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Same .env as the apps (decision D11).
const rootEnv = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const adminUrl = "http://localhost:3001";
const ci = Boolean(process.env.CI);

/**
 * UI smoke tests. They run the server in mock-bot mode (`dev:mock`: in-memory
 * Bot API, `/__dev/login-link`) and the dashboard in dev mode.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? [["github"], ["list"]] : "list",
  use: {
    baseURL: adminUrl,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Locally, use the installed Chrome instead of downloading a browser.
      use: { ...devices["Desktop Chrome"], ...(ci ? {} : { channel: "chrome" }) },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @tgstack/server dev:mock",
      url: `${apiUrl}/health`,
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @tgstack/admin dev",
      url: `${adminUrl}/login`,
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
  metadata: { apiUrl },
});
