# Backlog

Anything that is out of scope for v1.0 (see `PLAN.md` § 1 and § 4 Phase 9) or discovered while building lands here.

## Post-v1 (from PLAN.md Phase 9 — do not start without approval)
- `npx create-tgstack` CLI to pick modules (admin, miniapp, payments, i18n).
- VietQR / PayOS payment providers (the `PaymentProvider` interface is designed for them).
- Scheduled broadcasts and user segments (by locale, activity, purchase).
- Analytics: retention cohorts, funnel for the Mini App.
- AI assistant module (LLM replies + tools).
- Multi-bot support.

## Tooling
- Move to TypeScript 7 once NestJS tooling (`@nestjs/swagger`, `@nestjs/cli`) declares support (see D7).

## Performance
- Mini App bundle is ~200 kB gzipped (zod schemas, tma.js, translations of every namespace). Try `zod/mini` for the client, per-namespace translation chunks, and code-splitting the shop example.
- Cancelling a large broadcast leaves its queued jobs in BullMQ; they are skipped but still pass through the rate limiter. Remove them in bulk on cancel.

## Good first issues
_Populated in Phase 8 (T8.3)._
