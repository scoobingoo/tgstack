# Broadcasts

Send one message (HTML text or a photo with an HTML caption, plus an optional URL button) to every user who has not blocked the bot — without tripping Telegram's limits.

## Lifecycle

```
DRAFT ──start──▶ QUEUED ──snapshot──▶ RUNNING ──all handled──▶ COMPLETED
  │                │                     │
  └────cancel──────┴────────cancel───────┴──▶ CANCELLED
                   └──snapshot failed──▶ FAILED
```

Illegal moves answer `409 Conflict` ("Cannot start a completed broadcast"). Drafts can be edited (`PATCH`) until they are started.

## API (`/api/admin/broadcasts`, admin session required)

| Method | Path | |
|---|---|---|
| `GET` | `/` | list (`page`, `limit`, `status`) |
| `POST` | `/` | create a draft: `{ text, imageUrl?, buttonText?, buttonUrl? }` |
| `GET` | `/:id` | broadcast + counters |
| `PATCH` | `/:id` | edit a draft |
| `POST` | `/:id/preview` | send it to yourself only; Telegram errors (e.g. invalid HTML) come back as `400` |
| `POST` | `/:id/start` | `DRAFT → QUEUED` |
| `POST` | `/:id/cancel` | `DRAFT/QUEUED/RUNNING → CANCELLED` |
| `GET` | `/:id/events` | Server-Sent Events: a `progress` event (`{ status, total, sent, failed, … }`) whenever counters change; the stream ends after a final status |

Limits are validated up front: text ≤ 4096 characters (≤ 1024 with an image) after HTML parsing, button text ≤ 64, URLs `http(s)://` (`tg://` allowed for buttons).

## How sending works

Sending happens in the **worker** process (`main.worker.ts`, decision D2), through two BullMQ queues:

1. **`broadcast-control`** — `start` enqueues one job per broadcast. The worker pages through non-blocked users (500 at a time) and enqueues one `send` job each, with a deterministic job ID so a retried snapshot never duplicates a message. Only then does the broadcast become `RUNNING` with its final `total`.
2. **`broadcast-messages`** — one job per recipient. A global limiter lets **one job start every `1000 / BROADCAST_RATE_PER_SECOND` ms** across all worker processes. Even pacing (rather than `N` jobs per second in bursts) means no 1-second window ever sees more than the configured rate.

Per message:

| Telegram answer | What happens |
|---|---|
| OK | `sent += 1` |
| `429 Too Many Requests` | the whole queue pauses for `retry_after`; the job goes back to the queue (not counted as an attempt) |
| `403 Forbidden` (blocked, deactivated) | `User.isBlocked = true`, `failed += 1`, no retry |
| other `4xx` | `failed += 1`, no retry (retrying cannot help) |
| network error / `5xx` | retried up to 3 times with exponential backoff, then `failed += 1` |

Counters are incremented in a single SQL statement that also flips the broadcast to `COMPLETED` (with `finishedAt`) when `sent + failed = total`.

**Cancelling** sets the status; workers re-read it at least once per second and skip the remaining jobs (they still pass through the limiter, so draining a large cancelled broadcast takes a while — see the backlog).

## Tuning

- `BROADCAST_RATE_PER_SECOND` (default 25, max 30): Telegram allows roughly 30 messages per second for bulk notifications. Stay below it unless Telegram raised your bot's limits (paid broadcasts).
- Scale the worker horizontally freely: the limiter is global (stored in Redis).
- Each recipient is a Redis job (~1 KB). Completed jobs are removed; plan Redis memory for your largest audience.
