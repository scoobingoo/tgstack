# Changelog

All notable changes to this project are documented in this file.

## [1.0.0](https://github.com/scoobingoo/tgstack/releases/tag/v1.0.0) (2026-10-22)

### Features
- **Payments (PayOS / VietQR)**: Added `PayOsProvider` implementing `PaymentProvider` with HMAC-SHA256 signed payment links, `PaymentOrder` tracking (`PENDING`/`PAID`/`EXPIRED`/`CANCELLED`), constant-time webhook signature verification (`/api/webhooks/payos`), and VND revenue metrics on the dashboard.
- **Broadcasts (Segments & Scheduling)**: Added audience segmentation (locales, active/inactive window, buyer status) with live recipient count estimation (`POST /api/admin/broadcasts/audience`) and atomic scheduled broadcast claiming (`SCHEDULED` status).
- **Worker Liveness & Queue Purge**: Added cancelled broadcast queue purging (`purge` job) and worker liveness heartbeat healthchecks; pruned server Docker image from 800 MB to 323 MB.

## [0.5.0](https://github.com/scoobingoo/tgstack/releases/tag/v0.5.0) (2026-10-14)

### Features & Refactoring
- **Production Docker & Caddy**: Added multi-stage production Dockerfiles (`server`, `migrate`, `admin`, `miniapp`), `docker-compose.prod.yml` with automatic HTTPS via Caddy, and GHCR release workflow.
- **Architecture Alignment**: Reorganized `apps/server` into `common/`, `infra/`, `bot/`, `modules/`, and `examples/` with automated boundary enforcement tests (`architecture.spec.ts`).
- **Documentation**: Added English and Vietnamese documentation, community files, and Changesets workflow.

## [0.3.0](https://github.com/scoobingoo/tgstack/releases/tag/v0.3.0) (2026-10-03)

### Features
- **Telegram Mini App**: Added `apps/miniapp` (Vite + React 19 + `@tma.js/sdk-react`), Web Crypto HMAC-SHA256 `initData` validation in `@tgstack/shared`, and `/api/app/*` endpoints.
- **Telegram Stars Payments**: Completed `pre_checkout_query` verification, idempotent `successful_payment` handling, and dashboard refunds.

## [0.2.0](https://github.com/scoobingoo/tgstack/releases/tag/v0.2.0) (2026-09-15)

### Features
- **Admin API & Auth**: Passwordless `/admin` bot magic-link login with atomic Redis `GETDEL` token exchange, revocable `httpOnly` JWT sessions, and OpenAPI docs.
- **Broadcast Engine**: BullMQ rate-limited worker respecting Telegram's per-second limits, automatic `429 retry_after` queue pausing, `403` blocked-user detection, and real-time SSE progress streaming.

## [0.1.0](https://github.com/scoobingoo/tgstack/releases/tag/v0.1.0) (2026-08-28)

### Features
- **Core Monorepo & Infrastructure**: Turborepo + pnpm workspace, Biome, Docker Compose (Postgres + Redis), and GitHub Actions CI.
- **`@tgstack/nestjs-grammy`**: Publishable NestJS module for grammY with `@Update`, `@Command`, `@On` decorators, Nest enhancers, and fetch-level `MockBotApi`.
- **Database & Server**: Prisma 7 schema, BigInt serialization helpers, idempotent seed, and NestJS server skeleton with Pino logging and Terminus health checks.
