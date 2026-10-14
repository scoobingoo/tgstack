# The bot

The bot lives in `apps/server/src/bot` and is built on [`@tgstack/nestjs-grammy`](../packages/nestjs-grammy/README.md).

## Middleware pipeline

Every update goes through these steps, in order (`src/bot/middlewares/`, assembled by `bot-middlewares.service.ts`):

1. **Error boundary** — installed by nestjs-grammy. Unhandled errors are logged and the user gets a localized "something went wrong" reply (`error-boundary.ts`).
2. **Per-chat ordering** — `sequentialize()` from `@grammyjs/runner`. Long polling processes updates concurrently; this keeps one chat's updates in order.
3. **Logging** — one structured log line per update: type, user, chat, outcome, latency.
4. **User upsert** — creates/updates the `User` row and exposes it as `ctx.user`. Sets `lastSeenAt`, clears `isBlocked`, and sets `isBlocked=true` when the user blocks the bot (`my_chat_member` → `kicked`). Updates without a human sender stop here.
5. **Session** — `ctx.session`, stored in Redis (`bot:session:<chat>`, 30-day TTL). Add fields to `SessionData` in `bot.context.ts`.
6. **i18n** — `ctx.t(key)`, see below.
7. **Before conversations** — `BotMiddlewares.beforeConversations`, for handlers that must run even while a conversation is active (payments: `pre_checkout_query`, `successful_payment`). An active conversation consumes every update of its chat.
8. **Conversations** — `@grammyjs/conversations` with state in Redis, so a conversation survives restarts and works across instances.
9. **`/cancel`** — leaves any active conversation. It must run before conversations resume, so it is middleware rather than a handler.

Then the `@Update()` handlers run. API calls are retried on `429`/`5xx` by `@grammyjs/auto-retry`.

## Adding a command

```ts
@Update()
export class PingUpdate {
  @Command("ping")
  async ping(@Ctx() ctx: BotContext) {
    await ctx.reply(ctx.t("pong"));
  }
}
```

1. Add the class to the `providers` of a module (for example a new feature module imported by `AppModule`).
2. Add the message (`pong = …`) to **every** `packages/i18n/locales/<locale>/bot.ftl` — a test fails if a locale misses a key.
3. To show it in Telegram's command menu, register it from a provider: `commands.register({ command: "ping", descriptionKey: "command-ping" })` in `onModuleInit` (`BotCommandsRegistry`). Menus are published per locale with `setMyCommands` on boot; `adminOnly` commands only appear for `ADMIN_TELEGRAM_IDS`.

Messages are sent with `parse_mode: "HTML"`: wrap every user-provided value in `escapeHtml()` from `@tgstack/shared`.

## Languages

Translations are Fluent files in `packages/i18n/locales/<locale>/bot.ftl`, shared with the admin dashboard and the Mini App. The locale of an update is negotiated as `user.locale` → Telegram `language_code` → `en`. New users start with the locale of their Telegram app; `/language` (and the Mini App profile) changes `user.locale`, which applies to all later replies.

To add a language: create `packages/i18n/locales/<code>/*.ftl` with the same keys, add the code to `SUPPORTED_LOCALES` in `packages/shared/src/constants/index.ts` and its label to `LOCALE_LABELS` in `packages/i18n/src/index.ts`.

## Conversations

See the onboarding wizard (`src/examples/onboarding`) for a complete example. Rules of thumb from the conversations plugin:

- The conversation function is **replayed** on every update. Wrap side effects (DB writes, random values, time) in `conversation.external()`, `conversation.now()`, `conversation.random()`.
- Inside a conversation the context is a fresh `Context`: `ctx.user`, `ctx.session` and `ctx.t` are not available. Read what you need from the outer context with `conversation.external((outer) => outer.user.locale)`.
- Register conversations with `bot.use(createConversation(...))` from a provider's `onModuleInit`: that runs after the global middleware and before handlers are registered.

## Polling vs webhook

| | Polling (`BOT_MODE=polling`) | Webhook (`BOT_MODE=webhook`) |
|---|---|---|
| Use for | development | production |
| Needs a public URL | no | yes (HTTPS) |
| How | `@grammyjs/runner`, started on boot; any webhook is deleted first | `POST /telegram/webhook`, secret header checked (`401` otherwise) |

Webhook mode requires `BOT_WEBHOOK_SECRET` (1–256 characters of `A-Z a-z 0-9 _ -`). With `BOT_AUTO_SET_WEBHOOK=true` and `BOT_WEBHOOK_URL=https://your.domain`, the server calls `setWebhook(https://your.domain/telegram/webhook, { secret_token, allowed_updates })` on boot.

### Trying webhooks locally

Expose the server with a tunnel and point the webhook at it:

```bash
# Cloudflare Tunnel (no account needed for quick tunnels)
cloudflared tunnel --url http://localhost:3000
# or ngrok
ngrok http 3000
```

Then in `.env`:

```dotenv
BOT_MODE=webhook
BOT_WEBHOOK_URL=https://<the-tunnel-host>
BOT_WEBHOOK_SECRET=<openssl rand -hex 32>
BOT_AUTO_SET_WEBHOOK=true
```

Switching back to polling is enough to remove the webhook: polling mode always calls `deleteWebhook` first.

## Mini App button

`/start` shows an "Open the app" button and the server sets the chat menu button only when `MINIAPP_URL` is `https://` — Telegram rejects other Web App URLs. Use a tunnel for the Mini App during development (see `docs/miniapp.md`).
