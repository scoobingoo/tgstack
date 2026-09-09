# Admin API and authentication

## Signing in (magic link, decision D4)

```
admin ──/admin──▶ bot ──one-time link──▶ admin
admin ──opens ADMIN_URL/auth/callback?token=…──▶ dashboard ──POST /api/auth/exchange──▶ server
server ──Set-Cookie: tgstack_session (httpOnly, SameSite=Lax, Secure in prod)──▶ dashboard
```

1. Only users with `role = ADMIN` get a link. Promote yourself with `ADMIN_TELEGRAM_IDS` (applied on seed, on boot and when your user row is created) or from the dashboard.
2. The token is 256 random bits. Redis stores only `sha256(token)` for **5 minutes**; the exchange uses `GETDEL`, so a link works **once**.
3. The session is a JWT (HS256, `JWT_SECRET`, 12 hours) whose session id is also stored in Redis. `POST /api/auth/logout` deletes it, so a stolen cookie stops working after logout. Every request re-reads the user: demoting an admin ends their access immediately.
4. The message carrying the link is sent with `protect_content` so it cannot be forwarded.

The dashboard calls the API through the same origin (Next.js rewrites in development, the reverse proxy in production), so the cookie never crosses sites. `SameSite=Lax` plus CORS limited to `ADMIN_URL`/`MINIAPP_URL` protects state-changing requests.

## Endpoints

Interactive docs: **`/api/docs`** (OpenAPI JSON at `/api/docs-json`), available when `NODE_ENV` is not `production`. Request and response schemas are generated from the zod schemas in `packages/shared`, the same ones the dashboard uses to parse responses.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/exchange` | `{ token }` → session cookie |
| `GET` | `/api/auth/me` | current admin |
| `POST` | `/api/auth/logout` | revokes the session |
| `GET` | `/api/admin/stats` | totals, new users (today/7d/30d), active (7d), blocked, Stars revenue, 30-day series |
| `GET` | `/api/admin/users` | `page`, `limit` (≤100), `search` (username, name or Telegram ID), `role`, `blocked` |
| `GET` | `/api/admin/users/:id` | user + 20 latest payments, totals |
| `PATCH` | `/api/admin/users/:id` | `{ role }`; you cannot change your own role |
| `GET` | `/api/admin/products` | EXAMPLE shop; `includeInactive` (default `true`) |
| `POST` | `/api/admin/products` | `{ title (1-32), description (1-255), priceStars, imageUrl?, isActive? }` |
| `PATCH` | `/api/admin/products/:id` | any subset of the fields above |
| `DELETE` | `/api/admin/products/:id` | soft delete (`isActive=false`) |
| `GET` | `/api/admin/payments` | `page`, `limit`, `status`, `userId` |
| `POST` | `/api/admin/payments/:id/refund` | refunds through the provider; `409` if already refunded, `502` if Telegram refuses |

Broadcast endpoints are documented in [`broadcasts.md`](./broadcasts.md).

Conventions:

- Lists return `{ items, total, page, limit }`.
- Telegram IDs are strings; timestamps are ISO-8601 strings.
- Errors return `{ statusCode, error, message, issues? }`; validation errors list `issues: [{ path, message }]`.

## Adding an endpoint

```ts
@AdminController("reports", "admin: reports")   // = @Controller("admin/reports") + AdminGuard + OpenAPI tags
export class ReportsController {
  @Get()
  @ApiOkResponse({ standardSchema: reportSchema })
  list(@Query({ schema: listReportsQuerySchema }) query: ListReportsQuery) { … }
}
```

Define the schemas in `packages/shared/src/schemas`, validate input with `@Body({ schema })` / `@Query({ schema })` (a global `StandardSchemaValidationPipe` runs them) and map Prisma rows to DTOs explicitly (see `apps/server/src/common/dto.ts`).
