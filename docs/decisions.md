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
- **Decision:** `packages/db` exports the generated client, `createPrismaClient`/`createPrismaAdapter`, BigInt JSON helpers, and test helpers; the seed is `prisma/seed.ts`. The Nest `PrismaService` (lifecycle hooks) is in `apps/server/src/infra/prisma`.
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

## D34 — Payment updates are handled before the conversations plugin (2026-10-22)
- **Decision:** `pre_checkout_query` and `successful_payment` handlers are registered on `BotMiddlewares.beforeConversations`, a composer that runs before `conversations()`, instead of as `@Update()` handlers.
- **Reason:** an active conversation consumes every update of its chat; a user paying while the onboarding wizard waits for their name would otherwise never get the payment recorded.
- **Alternatives:** asking every conversation to `skip()` payment updates (easy to forget).

## D35 — `BOT_TEST_ENVIRONMENT` (2026-10-22)
- **Decision:** a boolean env var switches grammY's client to Telegram's test environment for the bot and the worker.
- **Reason:** PLAN T7.2 asks for a documented manual payment test in Telegram's test environment; without it the documented steps could not be followed.
- **Alternatives:** documenting only small real-Star payments.

## D36 — Feature-oriented server layout: `common/`, `infra/`, `bot/`, `modules/`, `examples/` (2026-10-22)
- **Decision:** `apps/server/src` follows `docs/architecture.md`: cross-cutting guards, decorators, filters, pipes and interceptors in `common/`; stateful connections (Prisma, Redis, BullMQ, logging, health) in `infra/`; the grammY pipeline and core commands in `bot/`; one folder per domain in `modules/` (auth, users, stats, broadcasts, payments); deletable showcases in `examples/`. Endpoints of one domain live together whatever their audience: `modules/users` owns `/api/admin/users/*` and `/api/app/me`. The former `admin/` and `miniapp/` modules are gone.
- **Reason:** a reader finds everything about a feature in one folder, and dependencies point one way: `examples` → `modules` → `bot`/`common` → `infra` → `config`. The only upward edges are the identity services every request needs (`UsersService`, `AuthService`). `apps/server/test/architecture.spec.ts` enforces it.
- **Alternatives:** the previous layout by audience (`admin/`, `miniapp/`), which split users and products across folders.

## D37 — Where the implementation departs from the architecture guide (2026-10-22)
- **Decision:** the layout follows the guide, including `/admin` in `bot/updates/admin.update.ts`, queue names in `@tgstack/shared` (`QUEUE_NAMES`) and `grammy-core.module.ts` / `grammy.explorer.ts` in `packages/nestjs-grammy` (aligned on 2026-10-22 at the owner's request). Four differences remain, because the guide's version would break something:
  1. The pipeline has two steps the guide does not list: `sequentialize` (required by the concurrent runner) and `beforeConversations` (D34); `/cancel` is middleware (`bot/middlewares/cancel.middleware.ts`), not an `@Update` handler, so an open wizard cannot swallow it.
  2. Sessions use our own `RedisStorage` instead of `@grammyjs/storage-redis`, whose published types are broken (D20).
  3. Translations stay split per app (`locales/<locale>/{bot,admin,miniapp}.ftl`), so the Mini App bundle only carries its own strings.
  4. Next.js 16 renamed `middleware.ts` to `proxy.ts`.
- **Reason:** see each item. `bot/` therefore depends on `modules/users` (identity) and `modules/auth` (the `/admin` magic link); the architecture test allows exactly those two.
- **Alternatives:** following the guide to the letter.

## D38 — `@tgstack/shared/constants` is the single source of cross-app values (2026-10-22)
- **Decision:** `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `SESSION_COOKIE`, `MINI_APP_AUTH_SCHEME`, `TELEGRAM_SECRET_TOKEN_HEADER` and `API_ROUTES` live in `packages/shared/src/constants`. `@tgstack/i18n` re-exports the locale list (it now depends on `@tgstack/shared`).
- **Reason:** the locale list was duplicated in a zod enum and the cookie name in the admin proxy; a test had to keep them in sync.
- **Alternatives:** keeping the duplicates with sync tests.

## D39 — BigInt safety net as a global interceptor (2026-10-22)
- **Decision:** `BigIntSerializerInterceptor` (`APP_INTERCEPTOR`) converts any `bigint` left in a response or SSE event to a string; it replaces the Express `json replacer`. Explicit DTO mappers remain the primary mechanism (D6).
- **Reason:** the replacer did not cover Server-Sent Events, which Nest serializes itself.
- **Alternatives:** patching `BigInt.prototype.toJSON` (global side effect in every process that imports `@tgstack/db`).

## D40 — Docker: one server image, a separate migrate image, Caddy in front (2026-10-22)
- **Decision:** `docker/server.Dockerfile` builds the API image (also run as the worker with `node dist/main.worker.js`) and a `migrate` target holding only `@tgstack/db` and the Prisma CLI. Admin uses Next's standalone output; the Mini App is static files served by Caddy. `docker-compose.prod.yml` puts Caddy (automatic HTTPS) in front: `/api`, `/telegram`, `/health` → server, `/app/` → Mini App, the rest → admin. Images install with `--trust-lockfile`.
- **Reason:** one origin means no CORS and first-party cookies; migrations run once before the server and worker start. The supply-chain check of the lockfile already ran on the developer's machine; repeating it in every image build took over six minutes.
- **Alternatives:** running migrations on server start (races between replicas), a Mini App subdomain.

## D41 — Cancelled broadcasts purge their queued messages (2026-10-22)
- **Decision:** cancelling a started broadcast adds a `purge` job to the control queue; the worker removes the broadcast's waiting `send` jobs by ID (`<broadcast>-<user>`, walking users in batches). A running snapshot also stops at its next batch.
- **Reason:** skipped jobs still went through the global rate limiter, so a cancelled 100k broadcast blocked the next one for over an hour.
- **Alternatives:** scanning the whole queue (`getJobs`), one queue per broadcast (limits are per queue, so the global rate limit would be lost).

## D42 — Worker liveness through a heartbeat file (2026-10-22)
- **Decision:** the worker touches a file every 10 s while its BullMQ workers run and Redis answers; the Docker healthcheck checks the file's age, and the worker exits after a minute of failures.
- **Reason:** the worker has no HTTP port, and Docker only restarts containers that exit, not unhealthy ones.
- **Alternatives:** a tiny HTTP server in the worker (a port to secure and publish for nothing else).

## D43 — Runtime-only configuration where images are shared (2026-10-22)
- **Decision:** the dashboard reads `BOT_USERNAME` at request time (replacing the build-time `NEXT_PUBLIC_BOT_USERNAME`); the server image keeps only packages reachable through `dependencies` (`docker/prune-node-modules.mjs`, ~430 MB → ~70 MB of `node_modules`); release images are built for amd64 and arm64; Mini App builds ignore `NODE_ENV=development` from the root `.env`.
- **Reason:** one published image must work for every bot and VPS; `pnpm deploy` installs peers such as the Prisma CLI; Vite applied the server's `NODE_ENV` to the Mini App build and shipped React's development bundle (200 kB → 136 kB gzipped once fixed).
- **Alternatives:** build arguments per deployment, a slimmer base image only.

## D44 — Segments and scheduled broadcasts (Phase 9, 2026-10-22)
- **Decision:** `Broadcast.segment` (JSON, validated by `broadcastSegmentSchema`: locales, active within / inactive for N days, buyers / non-buyers) and `Broadcast.scheduledAt` with a new `SCHEDULED` status (additive migration `broadcast_schedule_segments`). The segment is evaluated at the first snapshot. The worker sweeps due schedules every 15 s and enqueues the idempotent `start-<id>` job; the snapshot claims `SCHEDULED → QUEUED` atomically.
- **Reason:** owner-approved Phase 9 scope. Schedules in Postgres survive Redis restarts and need no cleanup on unschedule or cancel; segments evaluated late reach the users who match at send time.
- **Alternatives:** BullMQ delayed jobs per schedule (precise to the second, but lost with Redis and must be removed and re-added on every change); materialized recipient lists at save time (stale by send time).

## D45 — PayOS as the second payment provider (Phase 9, 2026-10-22)
- **Decision:** `PayOsProvider` (`modules/payments/providers/payos/`) implements `PaymentProvider` for VND bank transfers through PayOS hosted checkouts (VietQR). New `PaymentOrder` table and `Product.priceVnd` (additive migration `payos_payment_orders`). The webhook lives at `/api/webhooks/payos`, a namespace authenticated by request signatures. The interface gained `refundMode` (`manual` for PayOS, which has no refund API) and a `checkout` invoice target. PayOS is registered only when its three credentials are set.
- **Reason:** owner-approved Phase 9 scope. PayOS is a gateway that confirms payments (webhook) and produces standard VietQR codes; a bare VietQR string cannot confirm anything. Facts verified on payos.vn/docs on 2026-10-22: signature algorithm, 9-character description limit, no sandbox, no refund endpoint.
- **Alternatives:** the official `@payos/node` SDK (one more dependency for three HTTP calls and an HMAC), static VietQR codes with manual reconciliation (no confirmation), reusing `Payment` with a PENDING status (would mix unpaid checkouts into payment lists and revenue).

