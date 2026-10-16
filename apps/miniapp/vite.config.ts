import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { signInitData } from "@tgstack/shared";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, "../..");

/**
 * Development only: serves `GET /__dev/init-data`, a freshly *signed* initData for a
 * fake user, so the app works in a normal browser against the real server.
 * The bot token is read here, in the dev server — it never reaches the browser.
 */
function devInitData(botToken: string | undefined): Plugin {
  return {
    name: "tgstack:dev-init-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/init-data", async (_req, res) => {
        if (!botToken) {
          res.statusCode = 500;
          res.end("BOT_TOKEN is not set: the dev init data cannot be signed.");
          return;
        }
        const raw = await signInitData(
          {
            auth_date: Math.floor(Date.now() / 1000),
            query_id: "dev-query",
            user: {
              id: 222_222_222,
              first_name: "Dev",
              last_name: "User",
              username: "dev_user",
              language_code: "en",
            },
            chat_type: "sender",
            chat_instance: "1",
            // Real initData always carries an Ed25519 `signature` (third-party validation);
            // the SDK requires the field. The server only checks the HMAC `hash`.
            signature: "dev-signature-not-verified",
          },
          botToken,
        );
        res.setHeader("content-type", "text/plain");
        res.end(raw);
      });
    },
  };
}

/**
 * `virtual:dev-mock` is the browser-dev Telegram mock (src/mocks/dev-mock.ts) under
 * `vite dev`, and an empty stub in production builds, so it never ships.
 */
function devMockModule(): Plugin {
  const id = "virtual:dev-mock";
  let isBuild = false;
  return {
    name: "tgstack:dev-mock",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(resolved) {
      if (resolved !== `\0${id}`) return undefined;
      return isBuild
        ? "export async function mockEnvironmentForBrowserDev() {}"
        : 'export * from "/src/mocks/dev-mock.ts";';
    },
  };
}

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    // The shared root .env may say NODE_ENV=development (for the server). Vite would
    // apply it to the build and ship React's development bundle, twice the size.
    // An empty value, set before any loadEnv() call, makes Vite ignore it.
    process.env.VITE_USER_NODE_ENV ??= "";
  }
  // Root .env first (decision D11), then apps/miniapp/.env overrides.
  const env = { ...loadEnv(mode, repoRoot, ""), ...loadEnv(mode, appDir, "") };
  const apiTarget = env.VITE_API_URL || "http://localhost:3000";

  return {
    base: env.MINIAPP_BASE_PATH || "/",
    envDir: repoRoot,
    plugins: [react(), tailwindcss(), devInitData(env.BOT_TOKEN), devMockModule()],
    server: {
      port: 5173,
      // Tunnels (cloudflared, ngrok) use their own host names.
      allowedHosts: true,
      proxy: { "/api": { target: apiTarget, changeOrigin: true } },
    },
    preview: { port: 4173 },
  };
});
