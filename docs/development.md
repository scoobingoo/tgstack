# Local development

## Prerequisites

- Node.js 24 (`.nvmrc`) and pnpm 12 (`corepack enable` or `npm i -g pnpm@12`)
- Docker (for Postgres and Redis)
- A Telegram bot token from [@BotFather](https://t.me/BotFather) — use a separate bot for development

## First run

```bash
pnpm install
cp .env.example .env          # then set BOT_TOKEN, JWT_SECRET and ADMIN_TELEGRAM_IDS
pnpm infra:up                 # Postgres + Redis, waits until both are healthy
pnpm db:migrate               # apply migrations (creates new ones when the schema changed)
pnpm db:seed                  # sample products + ADMIN_TELEGRAM_IDS admins
pnpm dev                      # build packages, then run everything in watch mode
```

`pnpm --filter @tgstack/db run seed:demo` additionally creates 40 demo users and a few payments so the dashboard has something to show.

Ports already taken? Change `POSTGRES_PORT` / `REDIS_PORT` / `PORT` in `.env` and update the URLs next to them.

## Running pieces individually

| Command | What it runs |
|---|---|
| `pnpm --filter @tgstack/server dev` | API + bot (`main.ts`) **and** the queue worker (`main.worker.ts`), rebuilt and restarted on change |
| `pnpm --filter @tgstack/server dev:api` | API + bot only |
| `pnpm --filter @tgstack/db studio` | Prisma Studio |

The server validates its environment before starting and prints every invalid variable at once:

```
Invalid environment variables:
  - BOT_TOKEN: is required (get one from @BotFather)
  - JWT_SECRET: must be at least 32 characters (try `openssl rand -hex 32`)
```

## Tests

```bash
pnpm infra:up
pnpm test
```

Integration tests talk to the real Postgres and Redis from `docker-compose.yml`:

- `TEST_DATABASE_URL` is a base URL; each package creates and migrates its own `<name>_<package>` database (decision D17).
- `TEST_REDIS_URL` must point at a dedicated Redis DB (default `/15`); tests refuse to flush DB 0.
- The Telegram Bot API is **never** called: tests use `MockBotApi` from `@tgstack/nestjs-grammy/testing`, and with `NODE_ENV=test` any unmocked request fails immediately.

Set `TEST_LOG_LEVEL=info` to see the server logs while a test runs.

## Code style

`pnpm lint` runs Biome (`pnpm lint:fix` to fix). Every commit should pass `pnpm lint && pnpm typecheck && pnpm test` and use [Conventional Commits](https://www.conventionalcommits.org).
