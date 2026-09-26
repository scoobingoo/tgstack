# Decision log

Every non-obvious choice made while building tgstack. Format: **date — decision**, then reason and the alternatives that were considered. Newest entries at the bottom.

## D1 — grammY over Telegraf (2026-10-22)
- **Decision:** the bot layer is built on [grammY](https://grammy.dev).
- **Reason:** better TypeScript types, an active official plugin ecosystem (conversations, runner, i18n, auto-retry, storage adapters). The NestJS ecosystem mostly wraps Telegraf, so a first-class `nestjs-grammy` module is a differentiator.
- **Alternatives:** Telegraf + `nestjs-telegraf`; raw Bot API client.

## D2 — One NestJS codebase, two processes (2026-10-22)
- **Decision:** `apps/server` has two entry points: `main.ts` (HTTP API + bot) and `main.worker.ts` (BullMQ processors).
- **Reason:** one codebase is simple to reason about; the processes scale independently and a slow broadcast never blocks update handling.
- **Alternatives:** separate `apps/worker` package (more boilerplate, duplicated modules); in-process workers (couples throughput to the HTTP process).

## D3 — Polling in dev, webhook in prod (2026-10-22)
- **Decision:** controlled by `BOT_MODE=polling|webhook`.
- **Reason:** polling needs no public URL on a laptop; webhooks are cheaper and faster in production.
- **Alternatives:** webhook everywhere via a tunnel (slower onboarding).

## D4 — Admin login via bot magic link (2026-10-22)
- **Decision:** an admin sends `/admin` to the bot, receives a one-time link, and the admin app exchanges the token for an httpOnly JWT cookie.
- **Reason:** Telegram-native, works on localhost, no passwords to store or leak.
- **Alternatives:** Telegram Login Widget (needs a public domain registered with BotFather), email/password.

## D5 — Mini App as a Vite SPA (2026-10-22)
- **Decision:** `apps/miniapp` is a Vite + React single-page app.
- **Reason:** Mini Apps are client-only; avoids SSR friction with `window.Telegram` and static hosting is trivial.
- **Alternatives:** Next.js (SSR features unused inside a WebView).

## D6 — Telegram IDs are BigInt in the DB, strings in JSON (2026-10-22)
- **Decision:** `telegramId` columns are `BigInt`; every JSON API serialises them as strings.
- **Reason:** Telegram IDs can exceed 2^31 and may exceed 2^53 in the future; JSON numbers lose precision above 2^53.
- **Alternatives:** `Int`/`Float` columns (unsafe), strings in the DB (no numeric ordering, weaker constraints).

## D7 — TypeScript 6.0 instead of 7.0 (2026-10-22)
- **Decision:** pin `typescript@6.0.x` across the monorepo.
- **Reason:** TypeScript 7.0 (the native port) is the latest stable release, but parts of the ecosystem this plan depends on still declare `typescript: ^5 || ^6` peers (e.g. `@nestjs/swagger@12`) and rely on the classic compiler API. 6.0 is the newest release they support. NestJS also needs `experimentalDecorators` + `emitDecoratorMetadata`, which 6.0 supports fully.
- **Alternatives:** TypeScript 7.0 (revisit once Nest tooling declares support — tracked in `docs/backlog.md`).

## D8 — Toolchain baseline: Node 24 LTS, pnpm 12, Turborepo 2, Biome 2 (2026-10-22)
- **Decision:** `.nvmrc` pins Node 24 (the active LTS line on this date); `packageManager` pins pnpm 12.
- **Reason:** latest stable releases at the time of scaffolding (plan rule 3).
- **Alternatives:** Node 22 (maintenance LTS).

## D9 — ESM everywhere (2026-10-22)
- **Decision:** every package and app is `"type": "module"`; Node code compiles with `module: NodeNext` and relative imports use `.js` extensions.
- **Reason:** NestJS 12 ships ESM-only (`"type": "module"`), as do Vitest 5 and most of the toolchain. Mixing CJS would only add interop edge cases.
- **Alternatives:** CommonJS output (blocked by NestJS 12).

## D10 — Internal packages are compiled to `dist/` with `tsc` (2026-10-22)
- **Decision:** `packages/*` build with `tsc` to `dist/` and expose `exports` that point at the compiled files. Turborepo runs `^build` before `typecheck`, `test` and `dev`.
- **Reason:** the NestJS server runs plain Node at runtime and needs decorator metadata, so "source-only" internal packages would need a runtime transpiler. Compiled packages behave the same in dev, tests, Docker and for npm publishing (`nestjs-grammy`).
- **Alternatives:** source exports with custom conditions + a TS loader (fragile with decorators), tsup/tsdown bundling (unnecessary for libraries consumed inside the workspace).

## D11 — One root `.env` in development (2026-10-22)
- **Decision:** a single root `.env` (copied from `.env.example`) feeds Docker Compose and every app. Each app also ships its own `.env.example` that documents only the variables it reads; an app-local `.env` overrides the root one.
- **Reason:** matches the "clone → fill `.env` → up" goal; avoids keeping four copies of `BOT_TOKEN` in sync.
- **Alternatives:** per-app `.env` files only (more copying during onboarding).

## D12 — Biome does not format Markdown (2026-10-22)
- **Decision:** `**/*.md` is excluded from Biome.
- **Reason:** Biome's Markdown formatter rewrites tables and spacing in hand-written docs (including `PLAN.md`), producing noisy diffs.
- **Alternatives:** opt specific folders back in later.

## D13 — Biome `useImportType` is off for NestJS code (2026-10-22)
- **Decision:** `style/useImportType` is disabled for `packages/nestjs-grammy/**` and `apps/server/**`.
- **Reason:** Nest's dependency injection reads constructor parameter types from `emitDecoratorMetadata`. Biome rewrote `import { PrismaService }` to `import type { … }`, which erases the class at runtime and breaks DI silently.
- **Alternatives:** `biome-ignore` comments on every provider import (noisy, easy to forget).

## D14 — nestjs-grammy installs its own error boundary (2026-10-22)
- **Decision:** `createBot()` installs an error boundary in front of all middleware that calls the module's `catch` handler. Exception filters on bot handlers must return a value to mark an exception handled.
- **Reason:** grammY only calls `bot.catch` while polling; in webhook mode an unhandled error became an HTTP 500 and Telegram would resend the update. NestJS 12 treats a filter that returns `undefined` as "not handled".
- **Alternatives:** document "install `bot.errorBoundary()` yourself" (easy to miss).

## D15 — `PrismaService` lives in `apps/server`; `packages/db` stays framework-agnostic (2026-10-22)
- **Decision:** `packages/db` exports the generated client, `createPrismaClient`/`createPrismaAdapter`, BigInt JSON helpers, the seed and test helpers. The Nest `PrismaService` (lifecycle hooks) is in `apps/server/src/prisma`.
- **Reason:** keeps `@nestjs/*` out of the database package so scripts and future apps can use it.
- **Alternatives:** Nest peer dependency in `packages/db`.

## D16 — Typed zod config module instead of `@nestjs/config` (2026-10-22)
- **Decision:** `apps/server/src/config` validates `process.env` with a zod schema and provides an injectable `AppConfig` with a fully typed `env`. `main.ts` validates before Nest starts and prints every problem at once.
- **Reason:** simpler, fully typed (no string keys), and failing before `NestFactory.create` gives a readable error instead of a stack trace.
- **Alternatives:** `@nestjs/config` with `validate` (string-keyed `get()`; errors surface inside Nest's bootstrap).

## D17 — One test database per package (2026-10-22)
- **Decision:** integration tests derive `<TEST_DATABASE_URL>_<package>` and create/migrate it in Vitest's global setup.
- **Reason:** Turborepo runs package test tasks in parallel; sharing one database made suites truncate each other's data.
- **Alternatives:** Testcontainers per suite (slower, needs Docker-in-Docker in some CI setups), serialising all tests.

## D18 — BigInt → string via Express' `json replacer` (2026-10-22)
- **Decision:** `configureApp()` sets `app.set("json replacer", bigIntReplacer)`; `serializeBigInt()` is used where Express is not involved (SSE).
- **Reason:** one switch covers every JSON response (D6) without patching `BigInt.prototype` or mapping every DTO.
- **Alternatives:** a global interceptor that deep-copies responses; `BigInt.prototype.toJSON` monkey-patch.

## D19 — Bot API mocked at the HTTP (`fetch`) level in tests (2026-10-22)
- **Decision:** `MockBotApi` exposes `clientOptions` (a custom `fetch`) in addition to an API transformer; the server's tests use `botConfig.client`. With `NODE_ENV=test` and no mock, the server installs a `fetch` that throws.
- **Reason:** the conversations plugin creates a fresh `Api` from the bot's client options for every conversation step; those instances do not inherit `bot.api` transformers, so a transformer-only mock let calls through to the real Telegram API.
- **Alternatives:** intercepting `node-fetch` globally (brittle), a local fake Bot API HTTP server (more moving parts).

## D20 — Own Redis storage adapter for sessions and conversations (2026-10-22)
- **Decision:** `apps/server/src/bot/redis-storage.ts` implements grammY's `StorageAdapter` on the shared ioredis client (with TTL).
- **Reason:** `@grammyjs/storage-redis@2.6.0` points its ESM `types` export at a file that is not published (`dist/mod.d.ts`), so it does not type-check under `NodeNext`. The adapter is 30 lines.
- **Alternatives:** a `declare module` shim for the broken package.

## D21 — Fluent files compiled into a TypeScript module (2026-10-22)
- **Decision:** `packages/i18n/scripts/generate.mjs` turns `locales/<locale>/<namespace>.ftl` into `src/generated/resources.ts` at build time. The bot loads them into `@grammyjs/i18n`; the admin dashboard and Mini App use `createTranslator()` (`@fluent/bundle`). Isolation marks are disabled.
- **Reason:** one source of truth for every app, no file-system access needed in browsers, and a parity test catches missing keys.
- **Alternatives:** per-app translation files; loading `.ftl` files with bundler-specific raw imports.

## D22 — zod schemas are the single source for validation and OpenAPI (2026-10-22)
- **Decision:** request/response schemas live in `packages/shared` (zod 4). The server validates with NestJS 12's `StandardSchemaValidationPipe` (`@Body({ schema })`) and documents with `@nestjs/swagger`'s Standard JSON Schema support (`standardSchema`). The dashboard parses responses with the same schemas.
- **Reason:** no class-validator DTOs to keep in sync; the spec cannot drift from the code.
- **Alternatives:** `nestjs-zod`; class-validator DTO classes.

## D23 — Revocable JWT sessions (2026-10-22)
- **Decision:** the session cookie holds a JWT signed with `JWT_SECRET` whose `sid` must also exist in Redis (12 h TTL). The guard reloads the user on every request.
- **Reason:** stateless JWTs cannot be logged out or revoked; a Redis lookup per admin request is cheap and makes logout and demotion take effect immediately.
- **Alternatives:** pure stateless JWT; server-side sessions without JWT (equivalent, but the signed token avoids a Redis lookup for garbage cookies).

## D24 — Payments core is not an example; the shop catalogue is (2026-10-22)
- **Decision:** `apps/server/src/payments` (provider interface, Telegram Stars provider, refunds, admin payment list) is core. Products and their admin CRUD live in `src/examples/shop`.
- **Reason:** most bots that adopt the template want payments but sell their own things; `Payment.productId` is optional.
- **Alternatives:** treat all of payments as an example.

## D25 — Broadcast pacing: one message every 1000/rate ms (2026-10-22)
- **Decision:** the message queue's BullMQ limiter is `{ max: 1, duration: ceil(1000 / BROADCAST_RATE_PER_SECOND) }`; a `429` pauses the queue for `retry_after` via `queue.rateLimit()` + `Worker.RateLimitError()`.
- **Reason:** `{ max: rate, duration: 1000 }` allows bursts at window boundaries (up to 2× the rate in a sliding second). Even pacing provably keeps every 1-second window at or below the rate, which the integration test checks.
- **Alternatives:** token bucket in Redis; grammY's throttler transformer (per process, not global).

## D26 — `PATCH /api/admin/broadcasts/:id` for drafts (2026-10-22)
- **Decision:** drafts are editable until started (not listed in PLAN T4.1).
- **Reason:** the T5.2 composer needs to fix a typo found in the preview without creating a new draft each time.
- **Alternatives:** create a new draft per edit (clutters the list).

## D27 — Dev runs API and worker together with `tsc --watch` + `node --watch` (2026-10-22)
- **Decision:** `apps/server` builds with plain `tsc`; `pnpm dev` runs one `tsc --watch` and `node --watch` for `main.js` and `main.worker.js` (via `concurrently`). The Nest CLI is not used.
- **Reason:** two `nest start --watch` processes would fight over `dist/`; plain `tsc` is one less tool and emits the decorator metadata Nest needs.
- **Alternatives:** Nest CLI with SWC builder; a second app package for the worker.

## D28 — shadcn/ui with the Radix base and the "Nova" preset (2026-10-22)
- **Decision:** `shadcn init -b radix -p nova`; vendored components live in `apps/admin/src/components/ui` (a few Biome rules are relaxed there). The CLI's `cn` helper package (maintained by shadcn) replaces `clsx` + `tailwind-merge`.
- **Reason:** Radix primitives are the most widely documented shadcn base; Nova is the CLI default style. Keeping the generated files untouched makes `shadcn add` updates painless.
- **Alternatives:** Base UI base (newer API, less familiar); hand-written components.

## D29 — Mock-bot development mode (2026-10-22)
- **Decision:** `pnpm --filter @tgstack/server dev:mock` runs the API and worker with `MockBotApi` and serves `GET /__dev/login-link`. It refuses `NODE_ENV=production` and the route only exists in that script.
- **Reason:** the dashboard and its Playwright smoke tests must work without a real bot token or Telegram account.
- **Alternatives:** a test-only HTTP endpoint inside the app (risk of shipping it), seeding sessions directly in Redis.

## D30 — Admin talks to the API through its own origin (2026-10-22)
- **Decision:** `/api/*` is rewritten to `NEXT_PUBLIC_API_URL` by Next.js in development and routed by the reverse proxy in production; the client never calls another origin.
- **Reason:** keeps the session cookie first-party (`SameSite=Lax`, no CORS credentials juggling) and SSE works through the same path.
- **Alternatives:** calling the API cross-origin with `credentials: "include"` (needs `SameSite=None; Secure` cookies and HTTPS everywhere).

## D31 — Mini App UI: Tailwind + Telegram theme variables, no UI kit (2026-10-22)
- **Decision:** the Mini App uses Tailwind CSS with colours mapped to the CSS variables tma.js binds from Telegram's theme (`--tg-theme-*`), plus native Back/Main buttons.
- **Reason:** `@telegram-apps/telegram-ui` (the Telegram UI kit) only declares React 18 peers; the app uses React 19. A handful of Telegram-style components is enough for the example screens.
- **Alternatives:** the UI kit with peer overrides; shadcn/ui (heavier, desktop-oriented).

## D32 — initData validation with Web Crypto in `@tgstack/shared` (2026-10-22)
- **Decision:** `validateInitData`/`signInitData` use `globalThis.crypto.subtle` (async) and a constant-time comparison written in TypeScript.
- **Reason:** the same code runs in the server, in tests, in the Vite dev server (to sign mock data) and would run in browsers, without `node:crypto` breaking client bundles.
- **Alternatives:** `node:crypto` in a server-only subpath.

## D33 — Browser development of the Mini App with signed mock data (2026-10-22)
- **Decision:** outside Telegram, `vite dev` mocks the Telegram environment with tma.js' `mockTelegramEnv` and a *real* initData signed by the dev server (`/__dev/init-data`, using `BOT_TOKEN` server-side). Production builds replace the mock module with an empty stub.
- **Reason:** the real `MiniAppAuthGuard` stays in the loop during development — no auth bypass flag to forget in production — and the token never reaches the browser.
- **Alternatives:** an "unsafe dev mode" switch in the server guard.
