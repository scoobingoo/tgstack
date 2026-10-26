# Deployment (single VPS)

`docker-compose.prod.yml` runs the whole stack on one server behind [Caddy](https://caddyserver.com), which gets and renews HTTPS certificates automatically:

```
https://your.domain/          → admin dashboard (Next.js)
https://your.domain/app/      → Mini App (static files)
https://your.domain/api/*     → API         ┐
https://your.domain/telegram/ → bot webhook ├ server (NestJS)
https://your.domain/health    → health      ┘
                                worker (broadcasts) · Postgres · Redis · migrate (one-off)
```

One domain means no CORS, first-party cookies for the dashboard, and an HTTPS Mini App URL Telegram accepts.

## What you need

- A VPS with Docker Engine and the Compose plugin. 1 vCPU / 2 GB RAM is enough to start; building the images on the server needs about 2 GB of RAM (or use prebuilt images, see below).
- A domain (or subdomain) whose `A`/`AAAA` record points at the server, and ports 80 and 443 open.
- A bot token from [@BotFather](https://t.me/BotFather).

## First deployment

```bash
git clone https://github.com/scoobingoo/tgstack.git && cd tgstack
cp .env.example .env
```

Edit `.env`. The production compose file sets the URLs, `NODE_ENV`, `BOT_MODE=webhook` and the database/Redis addresses itself; you provide:

| Variable | Value |
|---|---|
| `DOMAIN` | `tg.example.com` (no scheme) |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` — hex, so it is safe inside a URL |
| `BOT_TOKEN` | from @BotFather |
| `BOT_WEBHOOK_SECRET` | `openssl rand -hex 32` |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_TELEGRAM_IDS` | your Telegram user ID (ask [@userinfobot](https://t.me/userinfobot)) |
| `BOT_USERNAME` | optional: bot username for the "Open the bot" button on the login page |

Then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The `migrate` service applies Prisma migrations and exits; the server and worker start after it succeeds. On boot the server promotes `ADMIN_TELEGRAM_IDS` to admins, calls `setWebhook` with the secret, publishes the command menus and sets the Mini App menu button.

Optional sample products:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate prisma db seed
```

## Check it

```bash
curl https://tg.example.com/health
docker compose -f docker-compose.prod.yml logs -f server worker
```

Then send `/start` to the bot (a user row appears), `/admin` to get a login link for the dashboard, and open the Mini App from the menu button. `getWebhookInfo` should show your URL and no `last_error_message`:

```bash
curl "https://api.telegram.org/bot<token>/getWebhookInfo"
```

To register the Mini App as the bot's main app (the "Open" button in the profile), use @BotFather → *Bot Settings* → *Configure Mini App* with `https://tg.example.com/app/`.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

New migrations run before the new server starts. The API is down for the few seconds the container restarts; Telegram retries webhook updates, so none are lost.

## Prebuilt images (GHCR)

Pushing a tag `v*` runs `.github/workflows/release.yml`, which publishes `ghcr.io/scoobingoo/tgstack-{server,migrate,admin,miniapp}`. To deploy them instead of building on the server, add to `.env`:

```dotenv
TGSTACK_IMAGE=ghcr.io/scoobingoo/tgstack
TGSTACK_TAG=1.0.0
```

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --no-build
```

## Operations

- **Logs** are JSON (pino) on stdout: `docker compose -f docker-compose.prod.yml logs -f server`.
- **More broadcast throughput**: Telegram allows about 30 messages per second per bot, and `BROADCAST_RATE_PER_SECOND` (default 25) is a global limit stored in Redis. More workers (`--scale worker=2`) help only with slow sends, never beyond the limit.
- **Backups**:

  ```bash
  docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U tgstack tgstack | gzip > backup-$(date +%F).sql.gz
  ```

  Redis holds sessions, conversations and queued jobs (append-only file in the `redis-data` volume); losing it logs everyone out and drops unsent broadcast messages, but no records.
- **Restore**: `gunzip -c backup.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U tgstack tgstack`.

## Running the whole stack locally in containers

```bash
docker compose --profile full up -d --build
```

builds the same images and serves them on <http://localhost:8080> (`FULL_STACK_PORT` changes the port), with the bot in long-polling mode. It needs a real `BOT_TOKEN` in `.env`. For day-to-day development `pnpm dev` is faster ([development](development.md)).

## Images

| Image | Built from | Runs |
|---|---|---|
| `tgstack-server` | `docker/server.Dockerfile` (target `runtime`) | `node dist/main.js` (API + bot) — and the worker with `node dist/main.worker.js` |
| `tgstack-migrate` | `docker/server.Dockerfile` (target `migrate`) | `prisma migrate deploy` (default), `prisma db seed` |
| `tgstack-admin` | `docker/admin.Dockerfile` | Next.js standalone server |
| `tgstack-miniapp` | `docker/miniapp.Dockerfile` | Caddy serving the static build (base path `/app/`) |

All images run as a non-root user except the Caddy-based Mini App image.
