# Backlog

Anything that is out of scope for v1.0 (see `PLAN.md` § 1 and § 4 Phase 9) or discovered while building lands here.

## Post-v1 (from PLAN.md Phase 9 — do not start without approval)
Scheduled broadcasts and user segments shipped on 2026-10-22 (D44). Follow-ups: segments by product bought, saved segments, recurring broadcasts.
PayOS (VietQR bank transfers) shipped on 2026-10-22 (D45). Follow-ups: show the VietQR code inside the Mini App (`qrCode` from PayOS) instead of the hosted page; cancel the PayOS link when the buyer gives up.

- `npx create-tgstack` CLI to pick modules (admin, miniapp, payments, i18n).
- Analytics: retention cohorts, funnel for the Mini App.
- AI assistant module (LLM replies + tools).
- Multi-bot support.

## Tooling
- Move to TypeScript 7 once NestJS tooling (`@nestjs/swagger`, `@nestjs/cli`) declares support (see D7).

## Performance
- Mini App bundle is ~136 kB gzipped; react-dom is half of it and zod (~83 kB minified) the next biggest. `zod/mini` schemas for the client would save ~20 kB gzipped but means maintaining a second set of schemas.

## Deployment
- Public demo (PLAN T8.3): a demo bot and dashboard with a read-only demo-admin role, reset nightly from the seed. Needs a `Role` value (schema change, needs approval) and a server to host it.

## Good first issues
Small, self-contained tasks for a first contribution. Comment on the issue before starting.

- **Add a language.** Copy `packages/i18n/locales/en/` to a new locale, translate, add the code to `SUPPORTED_LOCALES` and `LOCALE_LABELS` (docs/bot.md). The parity test tells you what is missing.
- **`/help` lists commands dynamically.** Build the help text from `BotCommandsRegistry` instead of a fixed translation, so new commands appear automatically.
- **Broadcast preview: broken image state.** When the image URL fails to load, the preview shows an empty box; show a small "image could not be loaded" placeholder instead (Telegram would reject the URL too).
- **Users table: export CSV.** A button on `/users` that downloads the current filter as CSV (client-side is fine).
- **Mini App: pull to refresh** on the shop list using TanStack Query's `refetch`.
- **Worker metrics.** Log queue depth (`waiting`, `delayed`) with each heartbeat so a stuck broadcast is visible in the logs.
