# Admin dashboard

`apps/admin` is a Next.js (App Router) app with Tailwind CSS, [shadcn/ui](https://ui.shadcn.com) (Radix, "Nova" preset), TanStack Query and TanStack Table. It talks to the server only through the typed client in `src/lib/api.ts`, which validates every response with the zod schemas from `@tgstack/shared`.

## Pages

| Route | What |
|---|---|
| `/login` | How to sign in: send `/admin` to the bot (optionally a button to open it, set `BOT_USERNAME`) |
| `/auth/callback?token=…` | Exchanges the magic-link token for the session cookie, then opens the dashboard |
| `/` | Stat cards, 30-day sign-up chart, recent payments |
| `/users` | Search (name, @username, Telegram ID), role/status filters, pagination; a drawer with details, payments and an admin switch |
| `/broadcasts` | List with live progress; `/broadcasts/new` and `/broadcasts/:id` hold the composer (Telegram HTML + live preview), "Send preview to me", start/cancel and a progress bar fed by Server-Sent Events (polling fallback) |
| `/products` | EXAMPLE shop: create/edit dialog, deactivate |
| `/payments` | Status filter and refunds with a confirmation dialog |

The UI is available in English and Vietnamese (`packages/i18n/locales/*/admin.ftl`, switcher in the header, remembered in a cookie) and in light/dark mode.

## How requests reach the API

The browser only ever calls **its own origin** (`/api/*`):

- in development, `next.config.ts` rewrites `/api/*` to `NEXT_PUBLIC_API_URL`;
- in production, the reverse proxy routes `/api` to the server before Next.js sees it.

So the httpOnly session cookie is first-party and `SameSite=Lax` is enough. `src/proxy.ts` (Next.js 16's name for middleware) sends visitors without a session cookie to `/login`; the API remains the real gatekeeper and any `401` also redirects to `/login`.

## Developing without a bot token

```bash
pnpm --filter @tgstack/server dev:mock   # API + worker with an in-memory Bot API
pnpm --filter @tgstack/admin dev         # http://localhost:3001
```

`dev:mock` prints an admin login link on start (and serves fresh ones at `GET /__dev/login-link`). Everything the bot would send — previews, broadcasts — is printed to the console instead. It refuses to start with `NODE_ENV=production`. Seed some data with `pnpm --filter @tgstack/db run seed:demo`.

## Tests

`pnpm --filter @tgstack/admin test:e2e` runs Playwright smoke tests (login redirect, magic-link login, expired link, composing, previewing and sending a broadcast). Playwright starts `dev:mock` and `next dev` itself unless they are already running. Locally it uses your installed Chrome; CI installs Chromium. The CI job is allowed to fail (PLAN §6).

## Adding a page

1. Add the endpoint and its zod schemas (see `docs/admin-api.md`), then a method in `src/lib/api.ts`.
2. Create `src/app/(dashboard)/<route>/page.tsx` (a client component using `useQuery`/`useMutation`), and reuse `PageHeader`, `DataTable` + `Pagination`, `ConfirmDialog`.
3. Add the sidebar entry in `src/components/app-sidebar.tsx` and the strings to both `admin.ftl` files.
