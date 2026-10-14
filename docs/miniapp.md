# Mini App

`apps/miniapp` is a Vite + React single-page app (decision D5) built on the official [tma.js](https://docs.telegram-mini-apps.com) React SDK (`@tma.js/sdk-react`). It follows the user's Telegram theme (theme parameters are bound to CSS variables and used through Tailwind colours such as `bg-tg-section`), uses Telegram's native **Back** and **Main** buttons, and talks to `/api/app/*` on the server.

| Screen | What |
|---|---|
| Shop (EXAMPLE) | Active products → product page → Main button "Buy for N ⭐" → Telegram Stars payment sheet (`openInvoice`) |
| Profile | Telegram name and ID, language switch (also changes the language the **bot** answers in), onboarding answers |

## Authentication (security-critical)

The app never sends user fields of its own. Every request carries the raw launch data:

```
Authorization: tma <Telegram.WebApp.initData>
```

`MiniAppAuthGuard` verifies it with `validateInitData()` from `@tgstack/shared` — the algorithm from [core.telegram.org/bots/webapps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):

1. data-check-string = every received field except `hash`, sorted by key, `key=value`, joined with `\n`;
2. secret key = HMAC-SHA-256 of the bot token with the key `"WebAppData"`;
3. `hash` must equal hex(HMAC-SHA-256(data-check-string, secret key)), compared in constant time;
4. `auth_date` must be younger than `INITDATA_MAX_AGE_SECONDS` (default 24 h).

Only then is the user upserted and trusted. The implementation uses Web Crypto, so it also runs in browsers and tests; its unit tests include a vector computed independently in Python.

## API (`/api/app`)

| Method | Path | |
|---|---|---|
| `GET` | `/me` | the verified user |
| `PATCH` | `/me` | `{ locale }` — shared with the bot |
| `GET` | `/products` | EXAMPLE: active products, cheapest first |
| `POST` | `/products/:id/invoice` | EXAMPLE: `{ url }` from `createInvoiceLink` (Stars, signed payload) |

## Developing in a normal browser

```bash
pnpm --filter @tgstack/server dev        # or dev:mock without a bot token
pnpm --filter @tgstack/miniapp dev       # http://localhost:5173
```

Outside Telegram, `vite dev` mocks the Telegram environment (`src/mocks/dev-mock.ts`):

- the dev server serves `GET /__dev/init-data`: a **real, signed** initData for a fake user, signed with `BOT_TOKEN` *inside the dev server* — the token never reaches the browser;
- Telegram's Main and Back buttons are drawn as plain buttons;
- `openInvoice` reports the invoice as cancelled (no payments outside Telegram).

None of this exists in production builds: `virtual:dev-mock` is replaced by an empty stub and the dev server middleware does not exist.

The dev server proxies `/api` to `VITE_API_URL` (default `http://localhost:3000`).

## Opening it inside Telegram

Telegram only opens Mini Apps over **HTTPS**, and BotFather rejects `localhost`. Use a tunnel to the Vite dev server:

```bash
cloudflared tunnel --url http://localhost:5173
# or
ngrok http 5173
```

Then set `MINIAPP_URL=https://<tunnel-host>` in `.env` and restart the server. With an HTTPS `MINIAPP_URL` the server sets the bot's **menu button** to the Mini App on boot and `/start` shows an "Open the app" button. API calls go through the same tunnel (`/api` is proxied by Vite), so nothing else needs to be public.

## Production

`pnpm --filter @tgstack/miniapp build` outputs a static site in `apps/miniapp/dist`. Serve it next to the API so `/api` is same-origin (the provided Caddy setup does), or set `VITE_API_URL` at build time. `MINIAPP_BASE_PATH` sets the base path (for example `/app/`).
