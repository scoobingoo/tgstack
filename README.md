# tgstack

> The production-ready, full-stack Telegram starter: **NestJS + grammY** bot, **Mini App**, **admin dashboard**, **rate-limited broadcasts** and **Telegram Stars payments** — in one monorepo.

🚧 Work in progress — see [`PLAN.md`](./PLAN.md) for the roadmap.

## Quick start (development)

```bash
pnpm install
cp .env.example .env   # set BOT_TOKEN, JWT_SECRET, ADMIN_TELEGRAM_IDS
pnpm infra:up          # Postgres + Redis
pnpm db:migrate && pnpm db:seed
pnpm dev
```

More in [`docs/development.md`](./docs/development.md).

## Repository

| Path | What |
|---|---|
| `apps/server` | NestJS: Telegram bot + REST API (`main.ts`) and queue worker (`main.worker.ts`) |
| `packages/nestjs-grammy` | Publishable NestJS module for grammY ([README](./packages/nestjs-grammy/README.md)) |
| `packages/db` | Prisma schema, migrations, seed |
| `packages/i18n` | Fluent translations (English, Vietnamese) shared by every app |
| `packages/shared` | Code shared by server and frontends |
| `docs/` | [Development](./docs/development.md) · [Bot](./docs/bot.md) · [Examples](./docs/examples.md) · [Decisions](./docs/decisions.md) |

## License

[MIT](./LICENSE)
