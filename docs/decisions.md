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
