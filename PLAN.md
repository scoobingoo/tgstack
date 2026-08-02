# tgstack — Implementation Plan

> **Working name:** `tgstack` (rename before first public release — check GitHub/npm availability first).
> **One-liner:** The production-ready, full-stack Telegram starter: **NestJS + grammY** bot, **Mini App**, **admin dashboard**, **rate-limited broadcasts** and **Telegram Stars payments** — in one monorepo, up with one command.

This document is the single source of truth for building v1.0. It is written for a coding agent. Read **Section 0** before doing anything.

---

## 0. Rules for the coding agent

1. **Work phase by phase, task by task, in order.** Do not start a phase until the previous one meets its acceptance criteria.
2. **Every task ends green:** `pnpm lint && pnpm typecheck && pnpm test` must pass before you commit. Use **Conventional Commits** (`feat(bot): ...`, `chore(repo): ...`).
3. **Versions:** this plan names libraries, not versions. Always install the **latest stable** release and read the **current official docs** before using an API. grammY plugins, Prisma, Next.js, Tailwind, shadcn/ui and the Telegram Mini Apps SDK change often — do not rely on memory.
4. **Telegram behavior:** verify against the official Bot API docs (`core.telegram.org/bots/api`, `core.telegram.org/bots/webapps`, `core.telegram.org/bots/payments-stars`). Never guess limits or field names.
5. **Secrets:** never commit tokens. Only `.env.example` files are tracked.
6. **Ambiguity:** pick the simplest option consistent with this plan and log it in `docs/decisions.md` (date, decision, reason, alternatives). Stop and ask the human only for decisions that are hard to reverse (public package names, license, DB schema breaking changes after Phase 3).
7. **Template mindset:** example features (shop, onboarding wizard) must live in clearly marked modules and be deletable without breaking the core. Mark them with `// EXAMPLE:` comments and document how to remove them.
8. **Docs as you go:** when a task changes setup or behavior, update the README or `docs/` in the same commit.
9. **No scope creep:** anything not in this plan goes to `docs/backlog.md`.

---

## 1. Scope

### Goals (v1.0)
- Clone → fill `.env` → `docker compose up` → working bot, admin and Mini App in under 5 minutes.
- Clean, NestJS-idiomatic bot code using **grammY** via a reusable `@tgstack/nestjs-grammy` module (decorators, DI, guards).
- Admin dashboard: users, stats, broadcasts, products, payments.
- Broadcasts through a queue that respects Telegram rate limits and handles blocked users.
- Mini App with secure server-side `initData` validation.
- Telegram Stars payments end to end (invoice → pre-checkout → success → refund).
- i18n (English + Vietnamese) across bot, admin and Mini App.
- Tests, CI, Docker images, docs site-quality README.

### Non-goals (v1.0)
- Multi-tenant / multiple bots per deployment.
- TON / crypto payments, fiat payment gateways (VietQR/PayOS → backlog, but design a payment provider interface now).
- Serverless deployment targets.
- A `create-tgstack` CLI (Phase 9 / backlog).

---

## 2. Architecture

```
                ┌──────────────── Telegram ────────────────┐
                │  Bot API (updates, sendMessage, invoices) │
                └──────▲───────────────────────┬────────────┘
                       │ webhook / polling     │ Mini App (WebView)
                       │                       ▼
┌──────────────────────┴───────┐      ┌─────────────────────┐
│ apps/server (NestJS)         │◄─────┤ apps/miniapp (Vite) │  initData auth
│  • BotModule (grammY)        │ REST └─────────────────────┘
│  • ApiModule  (/api/*)       │◄─────┐
│  • Auth, Users, Broadcasts,  │ REST │ ┌─────────────────────┐
│    Products, Payments        │      └─┤ apps/admin (Next.js)│  JWT cookie
└──────┬──────────────┬────────┘        └─────────────────────┘
       │ Prisma       │ BullMQ (enqueue)
       ▼              ▼
  ┌─────────┐    ┌─────────┐      ┌──────────────────────────┐
  │Postgres │    │  Redis  │◄─────┤ apps/server worker entry │ (same codebase,
  └─────────┘    └─────────┘      │ main.worker.ts: queues   │  separate process)
                 sessions, queue  └──────────────────────────┘
```

### Repository layout

```
tgstack/
├─ apps/
│  ├─ server/              # NestJS: bot + REST API (main.ts) and queue worker (main.worker.ts)
│  ├─ admin/               # Next.js (App Router) + Tailwind + shadcn/ui
│  └─ miniapp/             # Vite + React + official Telegram Mini Apps (tma.js) React SDK
├─ packages/
│  ├─ nestjs-grammy/       # Publishable NestJS module for grammY (decorators, discovery, guards)
│  ├─ db/                  # Prisma schema, client, migrations, seed
│  ├─ shared/              # zod schemas, DTO types, initData validation, constants
│  ├─ i18n/                # Fluent (.ftl) locale files shared by bot/admin/miniapp
│  └─ config/              # shared tsconfig, biome config
├─ docker/                 # Dockerfiles
├─ docs/                   # decisions.md, backlog.md, deployment.md, architecture.md, ...
├─ .github/workflows/      # ci.yml, release.yml
├─ docker-compose.yml      # dev: postgres, redis (+ optional full stack profile)
├─ docker-compose.prod.yml
├─ turbo.json
├─ pnpm-workspace.yaml
└─ PLAN.md
```

### Tech stack

| Concern | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Language | TypeScript (strict) everywhere |
| Bot framework | grammY + plugins: conversations, session (Redis storage adapter), i18n, auto-retry, runner (long polling), throttler/transformer where useful |
| Backend | NestJS (Express adapter) |
| DB | PostgreSQL + Prisma (in `packages/db`) |
| Cache / sessions / queue | Redis + BullMQ |
| Validation | zod (env + DTOs, shared between apps) |
| Logging | pino (nestjs-pino), pretty in dev, JSON in prod |
| Health | @nestjs/terminus (`/health`: db, redis) |
| Admin UI | Next.js App Router, Tailwind, shadcn/ui, TanStack Query, TanStack Table |
| Mini App | Vite + React + official tma.js React SDK + Telegram UI kit (or shadcn) |
| Lint/format | Biome |
| Tests | Vitest everywhere (NestJS via SWC plugin for decorator metadata); Testcontainers or docker-compose services for integration tests |
| CI | GitHub Actions |
| License | MIT |

### Key decisions (log them in `docs/decisions.md` at T0.1)
- **D1 – grammY over Telegraf:** better TypeScript types, active plugin ecosystem. The NestJS ecosystem mostly wraps Telegraf → `nestjs-grammy` is a differentiator.
- **D2 – One NestJS codebase, two processes:** `main.ts` (HTTP + bot) and `main.worker.ts` (BullMQ processors). Simple to reason about, scales independently.
- **D3 – Polling in dev, webhook in prod:** controlled by `BOT_MODE=polling|webhook`.
- **D4 – Admin login via bot magic link:** admin sends `/admin` to the bot → bot replies with a one-time link → admin app exchanges token for an httpOnly JWT cookie. Telegram-native, works on localhost, no passwords.
- **D5 – Mini App as Vite SPA** (not Next.js): Mini Apps are client-only; avoids SSR friction.
- **D6 – Telegram IDs are `BigInt`** in DB; serialized as **strings** in all JSON APIs.

---

## 3. Data model (Prisma sketch)

Adjust syntax to the current Prisma version; keep the semantics.

```prisma
enum Role { USER ADMIN }
enum BroadcastStatus { DRAFT QUEUED RUNNING COMPLETED CANCELLED FAILED }
enum PaymentStatus { PAID REFUNDED }

model User {
  id           String   @id @default(cuid())
  telegramId   BigInt   @unique
  username     String?
  firstName    String
  lastName     String?
  languageCode String?          // from Telegram
  locale       String   @default("en") // user-chosen
  role         Role     @default(USER)
  isBlocked    Boolean  @default(false) // bot blocked by user (403)
  createdAt    DateTime @default(now())
  lastSeenAt   DateTime @default(now())
  payments     Payment[]
  broadcasts   Broadcast[] @relation("BroadcastAuthor")
}

model Broadcast {
  id          String          @id @default(cuid())
  text        String          // HTML parse mode
  imageUrl    String?
  buttonText  String?
  buttonUrl   String?
  status      BroadcastStatus @default(DRAFT)
  total       Int             @default(0)
  sent        Int             @default(0)
  failed      Int             @default(0)
  authorId    String
  author      User            @relation("BroadcastAuthor", fields: [authorId], references: [id])
  createdAt   DateTime        @default(now())
  startedAt   DateTime?
  finishedAt  DateTime?
}

model Product {          // EXAMPLE: shop
  id          String   @id @default(cuid())
  title       String
  description String
  priceStars  Int      // amount in XTR
  imageUrl    String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  payments    Payment[]
}

model Payment {
  id                      String        @id @default(cuid())
  userId                  String
  user                    User          @relation(fields: [userId], references: [id])
  productId               String?
  product                 Product?      @relation(fields: [productId], references: [id])
  amount                  Int
  currency                String        // "XTR" for Stars
  provider                String        // "telegram-stars" (provider interface for future gateways)
  telegramPaymentChargeId String        @unique
  invoicePayload          String
  status                  PaymentStatus @default(PAID)
  createdAt               DateTime      @default(now())
  refundedAt              DateTime?
}
```

Ephemeral data (magic-link tokens, rate counters) lives in **Redis with TTL**, not Postgres.

---

## 4. Phases & tasks

Each task lists **Deliverables** and **Acceptance criteria (AC)**.

### Phase 0 — Repository foundation

**T0.1 Monorepo scaffold**
- Deliverables: pnpm workspace, Turborepo pipelines (`build`, `dev`, `lint`, `typecheck`, `test`), shared tsconfig (strict), Biome config, `.editorconfig`, `.nvmrc` (current Node LTS), MIT `LICENSE`, `docs/decisions.md` (D1–D6), `docs/backlog.md`.
- AC: `pnpm install && pnpm lint && pnpm typecheck` pass on an empty skeleton.

**T0.2 Dev infrastructure**
- Deliverables: `docker-compose.yml` with Postgres + Redis (named volumes, healthchecks); root scripts `pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`.
- AC: `docker compose up -d` brings both services healthy.

**T0.3 CI**
- Deliverables: `.github/workflows/ci.yml` — install with cache, lint, typecheck, test (with Postgres/Redis services), build.
- AC: CI green on the PR introducing it.

### Phase 1 — `packages/nestjs-grammy`

The reusable heart of the project. Build it as if it will be published on npm on its own.

**T1.1 Module core**
- Deliverables: `GrammyModule.forRoot()` / `forRootAsync()` providing a `Bot` instance (injectable via `@InjectBot()`); options: token, mode (polling/webhook), webhook path + secret token, bot config, global middlewares/plugins.
- Lifecycle: start polling (via grammY runner) on `onApplicationBootstrap`, graceful stop on shutdown; in webhook mode expose a handler the host app mounts and verify `X-Telegram-Bot-Api-Secret-Token`.
- AC: unit tests for option resolution; e2e test with a mocked Bot API (intercept `api.config` transformer) proving an update reaches a handler.

**T1.2 Decorators & discovery**
- Deliverables: class decorator `@Update()`; method decorators `@Start()`, `@Command(name)`, `@Hears(trigger)`, `@On(filterQuery)`, `@CallbackQuery(trigger)`, `@InlineQuery()`; param decorators `@Ctx()`, `@Message()`, `@Sender()`. Use NestJS `DiscoveryService` + `MetadataScanner` to register handlers on the bot at bootstrap.
- AC: tests cover each decorator; handlers in multiple `@Update` classes all register; order is deterministic.

**T1.3 Guards, interceptors, filters**
- Deliverables: execution context adapter so standard Nest `@UseGuards`, `@UseInterceptors`, `@UseFilters` work on bot handlers; `TelegramExecutionContext` helper to get `ctx`.
- AC: a test guard can block a command; an exception filter can reply with an error message.

**T1.4 Package polish**
- Deliverables: package README with examples, typed exports, `peerDependencies` on `@nestjs/common`, `@nestjs/core`, `grammy`; build with tsup or tsc.
- AC: package builds; README examples compile (type-checked snippet file).

### Phase 2 — Core bot (`apps/server`)

**T2.1 Server skeleton & config**
- Deliverables: NestJS app with `ConfigModule` validated by zod (fail fast on bad env), nestjs-pino logging, `/health` (db + redis), global exception filter, `main.ts` + `main.worker.ts` entries.
- AC: server boots with a valid `.env`; exits with a readable error listing invalid vars otherwise.

**T2.2 Database package**
- Deliverables: `packages/db` with schema (Section 3), first migration, `PrismaService` for Nest, seed (sample products, optional admin by `ADMIN_TELEGRAM_IDS`), BigInt JSON serialization helper.
- AC: `pnpm db:migrate && pnpm db:seed` works on fresh DB; serialization test proves BigInt → string.

**T2.3 Bot wiring & middleware**
- Deliverables: `BotModule` using `nestjs-grammy`; middleware pipeline: error boundary → logging (update type, latency) → user upsert (create/update `User`, set `lastSeenAt`, clear `isBlocked`) → session (Redis storage) → i18n → auto-retry on API calls.
- AC: sending `/start` to a real test bot creates a `User` row; logs show structured update entries.

**T2.4 i18n**
- Deliverables: `packages/i18n` with Fluent files `en.ftl`, `vi.ftl`; bot locale negotiation (user.locale → Telegram `language_code` → `en`); `/language` command with inline keyboard to switch.
- AC: switching language persists and changes all subsequent replies.

**T2.5 Commands & example conversation**
- Deliverables: `/start` (welcome + Mini App button), `/help`, `/language`, `/cancel`; set bot commands per locale via `setMyCommands` on boot. `// EXAMPLE:` onboarding wizard using the conversations plugin (ask name → ask preference via buttons → confirm) storing results on `User` or a JSON field.
- AC: wizard survives a server restart mid-conversation (state in Redis); `/cancel` exits cleanly.

**T2.6 Webhook mode**
- Deliverables: `BOT_MODE=webhook` mounts handler at `/telegram/webhook`, calls `setWebhook` with secret token and `allowed_updates` on boot (behind a flag `BOT_AUTO_SET_WEBHOOK`); docs for ngrok/cloudflared in dev.
- AC: requests without the correct secret header get 401; valid updates are processed.

### Phase 3 — Admin API & auth

**T3.1 Magic-link admin auth (D4)**
- Deliverables: `/admin` bot command (only for `role=ADMIN`) → generates random token, stores `sha256(token)` in Redis (TTL 5 min, single use) → replies with `ADMIN_URL/auth/callback?token=...`. `POST /api/auth/exchange` → validates, deletes token, sets httpOnly, `SameSite=Lax`, `Secure` (prod) JWT cookie. `GET /api/auth/me`, `POST /api/auth/logout`. `AdminGuard` for all `/api/admin/*` routes.
- AC: token cannot be reused; expired token rejected; non-admin gets no link; e2e tests for all paths.

**T3.2 Admin REST endpoints**
- Deliverables (all under `/api/admin`, zod-validated, paginated with cursor or page+limit):
  - `GET /stats` — total users, new users (today/7d/30d), active users (7d), blocked count, revenue in Stars, daily new-users series (30d).
  - `GET /users` (search by username/name/telegramId, filter role/blocked), `GET /users/:id`, `PATCH /users/:id` (role).
  - `GET/POST/PATCH /products`, `DELETE /products/:id` (soft: `isActive=false`).
  - `GET /payments`, `POST /payments/:id/refund`.
  - Broadcast endpoints defined in Phase 4.
- AC: e2e tests per endpoint including auth failures; OpenAPI spec generated via `@nestjs/swagger` at `/api/docs` (dev only).

### Phase 4 — Broadcasts (queue + worker)

**T4.1 Broadcast domain**
- Deliverables: `POST /api/admin/broadcasts` (create draft), `POST /api/admin/broadcasts/:id/preview` (send only to the requesting admin), `POST /:id/start`, `POST /:id/cancel`, `GET /:id` (progress), `GET /` (list).
- AC: state transitions enforced (e.g. cannot start a COMPLETED broadcast); tests for each transition.

**T4.2 Worker**
- Deliverables: on start, snapshot recipient IDs (non-blocked users) and enqueue jobs in batches into a BullMQ queue with a global **limiter** configured conservatively below Telegram's documented bulk limit (make it configurable, default ~25 msg/s). Processor sends message (text/photo + optional URL button), increments counters atomically.
  - Error handling: `429` → respect `retry_after` and re-delay; `403` (blocked/deactivated) → mark `User.isBlocked=true`, count as failed, no retry; other errors → limited retries with backoff then failed.
  - Cancellation: processor checks broadcast status before sending.
  - Completion: when `sent + failed == total` set COMPLETED + `finishedAt`.
- AC: integration test with mocked Bot API: 1,000 recipients, simulated 429s and 403s → correct final counters, blocked users flagged, throughput never exceeds limiter.

**T4.3 Realtime progress**
- Deliverables: Server-Sent Events endpoint `GET /api/admin/broadcasts/:id/events` (or polling fallback) emitting progress.
- AC: admin UI progress bar updates without page reload.

### Phase 5 — Admin dashboard (`apps/admin`)

**T5.1 Shell & auth**
- Deliverables: Next.js App Router app, Tailwind, shadcn/ui, dark mode, sidebar layout; `/login` page explaining "send /admin to the bot"; `/auth/callback` exchanges token; middleware redirects unauthenticated users. Typed API client using zod schemas from `packages/shared`; TanStack Query.
- AC: full login flow works locally against the server.

**T5.2 Pages**
- Deliverables:
  - **Dashboard:** stat cards + 30-day new-users chart + recent payments.
  - **Users:** searchable, paginated table (TanStack Table); user detail drawer with payments; role toggle.
  - **Broadcasts:** list; composer (HTML text with live Telegram-like preview, optional image URL + button); "Send preview to me"; start/cancel; progress bar via SSE.
  - **Products:** CRUD form. **Payments:** table + refund button with confirmation dialog.
  - i18n EN/VI for UI.
- AC: every page works with seeded data; Lighthouse accessibility ≥ 90 on dashboard; no console errors.

### Phase 6 — Mini App (`apps/miniapp`)

**T6.1 initData authentication (security-critical)**
- Deliverables in `packages/shared`: `validateInitData(initDataRaw, botToken, { maxAgeSeconds })` implementing the official algorithm: build data-check-string from all fields except `hash` sorted by key and joined with `\n`; `secret = HMAC_SHA256(key="WebAppData", data=botToken)`; compare `hex(HMAC_SHA256(key=secret, data=dataCheckString))` with `hash` using constant-time comparison; reject if `auth_date` is older than `maxAgeSeconds`.
- Server: `MiniAppAuthGuard` reading `Authorization: tma <initDataRaw>`; attaches user (upsert).
- AC: unit tests with known-good vectors, tampered fields, wrong token, expired auth_date. Re-read `core.telegram.org/bots/webapps` before implementing.

**T6.2 Mini App UI**
- Deliverables: Vite + React app using the official tma.js React SDK; theme follows Telegram theme params; uses Telegram BackButton/MainButton; env mocking for browser dev. Pages: **Profile** (Telegram user + locale switch synced with bot), `// EXAMPLE:` **Shop** (product list → buy).
- Mini App endpoints under `/api/app/*`: `GET /me`, `PATCH /me` (locale), `GET /products`, `POST /products/:id/invoice` (returns invoice link).
- AC: opens inside Telegram (via HTTPS tunnel in dev) and in browser with mocked env; locale change reflects in bot replies.

### Phase 7 — Payments (Telegram Stars)

**T7.1 Payment provider interface**
- Deliverables: `PaymentProvider` interface (`createInvoice`, `handlePreCheckout`, `handleSuccess`, `refund`) and `PaymentsModule` that resolves providers by name. Implement only `TelegramStarsProvider` now; leave VietQR/PayOS as backlog with a doc on how to add one.
- AC: module compiles with a second fake provider in tests.

**T7.2 Telegram Stars flow**
- Deliverables: invoice via `createInvoiceLink` (Mini App) and `sendInvoice` (bot `/buy` example) with currency `XTR` and empty provider token, payload = signed/opaque reference (userId + productId + nonce); handle `pre_checkout_query` (validate product active + payload, answer quickly — Telegram enforces a short deadline); handle `successful_payment` (idempotent insert keyed by `telegram_payment_charge_id`, thank-you message); admin refund via `refundStarPayment`, set `REFUNDED`. Verify all method names/fields against current Bot API docs.
- AC: tests with mocked API for happy path, duplicate success update (no double insert), invalid payload rejected at pre-checkout, refund updates status. Manual test documented using Telegram's test environment or small real amounts.

### Phase 8 — Production, docs & launch assets

**T8.1 Docker & deployment**
- Deliverables: multi-stage Dockerfiles (server, worker reuse same image with different command, admin standalone output, miniapp static served by nginx or Caddy); `docker-compose.prod.yml` with Caddy reverse proxy + automatic HTTPS (routes: `/api` & `/telegram` → server, `/` → admin, `app.` subdomain or `/app` → miniapp); `docs/deployment.md` for a single VPS.
- AC: fresh VPS guide reproducible; images build in CI and are pushed to GHCR on tag (`release.yml`).

**T8.2 README (this is the marketing page)**
- Deliverables: hero line + badges; **demo GIF** (bot → Mini App purchase → admin dashboard); "Why tgstack?" comparison table vs. plain grammY template / nestjs-telegraf / Mini App templates (factual, neutral); feature list; 5-minute quickstart; architecture diagram; "Removing example modules"; FAQ; contributing; license. Vietnamese README (`README.vi.md`).
- AC: a new developer following only the README gets everything running locally.

**T8.3 Live demo & community files**
- Deliverables: deploy a public demo bot + demo admin (read-only demo admin role, resets nightly via seed); `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR templates, `good first issue` list in `docs/backlog.md`; GitHub topics (`telegram-bot`, `grammy`, `nestjs`, `telegram-mini-app`, `boilerplate`, `monorepo`, `telegram-stars`).
- AC: demo links in README work.

**T8.4 Publish `@tgstack/nestjs-grammy` to npm**
- Deliverables: changesets for versioning; publish workflow with provenance.
- AC: package installable in a fresh NestJS app following its README.

### Phase 9 — Post-v1 (backlog, do not start without approval)
- `npx create-tgstack` CLI to pick modules (admin, miniapp, payments, i18n).
- VietQR / PayOS payment providers.
- Scheduled broadcasts and user segments (by locale, activity, purchase).
- Analytics: retention cohorts, funnel for Mini App.
- AI assistant module (LLM replies + tools).
- Multi-bot support.

---

## 5. Environment variables (initial set)

| Variable | App | Description |
|---|---|---|
| `NODE_ENV` | all | `development` / `production` |
| `DATABASE_URL` | server | Postgres connection string |
| `REDIS_URL` | server | Redis connection string |
| `BOT_TOKEN` | server | From @BotFather |
| `BOT_MODE` | server | `polling` / `webhook` |
| `BOT_WEBHOOK_URL` | server | Public base URL (webhook mode) |
| `BOT_WEBHOOK_SECRET` | server | Secret token for webhook header |
| `BOT_AUTO_SET_WEBHOOK` | server | `true` to call setWebhook on boot |
| `ADMIN_TELEGRAM_IDS` | server | Comma-separated IDs promoted to ADMIN on seed/boot |
| `JWT_SECRET` | server | Admin session signing |
| `ADMIN_URL` | server, admin | Public admin URL (magic links, CORS) |
| `MINIAPP_URL` | server, miniapp | Public Mini App URL (buttons, CORS) |
| `INITDATA_MAX_AGE_SECONDS` | server | initData freshness window |
| `BROADCAST_RATE_PER_SECOND` | server | Worker limiter (default conservative) |
| `NEXT_PUBLIC_API_URL` | admin | Server base URL |
| `VITE_API_URL` | miniapp | Server base URL |

Every app validates its env with zod at startup and ships a `.env.example`.

---

## 6. Testing strategy
- **Unit:** decorators/discovery, initData validation, locale negotiation, payload signing, state machines.
- **Integration:** NestJS + real Postgres/Redis (CI services) + **mocked Bot API** (grammY `api.config.use` transformer that records calls and returns fixtures). Never call the real Telegram API in CI.
- **E2E (API):** supertest against the Nest app for auth, admin, Mini App routes.
- **UI:** a few Playwright smoke tests for admin login + broadcast composer (Phase 5, optional in CI).
- Coverage target: ≥ 80% for `packages/nestjs-grammy` and `packages/shared`; meaningful coverage elsewhere.

---

## 7. Gotchas checklist (review before closing each phase)
- [ ] Telegram IDs exceed 32-bit → `BigInt` in DB, **string** in JSON.
- [ ] Bulk messaging limits and per-chat limits exist → limiter + `retry_after` handling; never `Promise.all` over all users.
- [ ] `403 Forbidden: bot was blocked by the user` → mark blocked, don't retry.
- [ ] Callback queries must be answered (`answerCallbackQuery`) or the client shows a spinner.
- [ ] `pre_checkout_query` must be answered quickly; keep the handler free of slow I/O.
- [ ] `successful_payment` handling must be idempotent.
- [ ] Webhook: verify secret header; respond 200 fast; don't block on long work (offload to queue).
- [ ] initData: constant-time compare, check `auth_date` age, never trust client-sent user fields.
- [ ] Mini App dev needs HTTPS (tunnel); BotFather rejects plain `localhost` URLs.
- [ ] HTML parse mode: escape user-provided content.
- [ ] Graceful shutdown: stop runner/polling, close BullMQ workers, Prisma, Redis.

---

## 8. Definition of done (v1.0)
- All Phase 0–8 acceptance criteria met; CI green on `main`.
- `docker compose up` from a fresh clone + `.env` gives a working bot, admin and Mini App.
- Public demo bot and README with GIF live.
- `@tgstack/nestjs-grammy` published to npm.
- Tag `v1.0.0` with release notes.
