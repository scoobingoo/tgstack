# Broadcasts

Send one message (HTML text or a photo with an HTML caption, plus an optional URL button) to a segment of your users — now or at a scheduled time — without tripping Telegram's limits.

## Lifecycle

```
DRAFT ──schedule──▶ SCHEDULED ──due (worker)──┐
  ▲  ◀──unschedule──┘   │                     │
  │                     │ start (send now)    ▼
  ├──start──────────────┴───────────────────▶ QUEUED ──snapshot──▶ RUNNING ──all handled──▶ COMPLETED
  │                                              │                     │
  └────────────cancel (any of these)───────────┴─────────────────────┴──▶ CANCELLED
                                                 └──snapshot failed──▶ FAILED
```

Illegal moves answer `409 Conflict` ("Cannot start a completed broadcast"). Drafts can be edited (`PATCH`) until they are scheduled or started; a scheduled broadcast goes back to `DRAFT` with `unschedule`.

## Segments

A broadcast goes to everyone who has not blocked the bot, or to a **segment**. Conditions are optional and combine with AND:

| Field | Meaning |
|---|---|
| `locales: ["en", "vi"]` | the user's locale (bot `/language`, Mini App profile) is one of these |
| `activeWithinDays: 7` | seen within the last N days (any update or Mini App request sets `lastSeenAt`) |
| `inactiveForDays: 30` | not seen for at least N days — win-back campaigns (not together with `activeWithinDays`) |
| `purchases: "buyers"` / `"non-buyers"` | has / has no `PAID` payment (refunded payments do not count) |

The segment is stored with the draft (`segment` in `POST`/`PATCH`; `{}` or `null` = everyone) and **evaluated when sending starts**, not when it is saved, so a broadcast scheduled for next week reaches the users who match next week. `POST /api/admin/broadcasts/audience` returns how many users match right now; the dashboard shows it live while you edit the conditions. The filter is built in `modules/broadcasts/broadcast-segment.ts` from indexed columns (`locale`, `lastSeenAt`) and the `Payment.userId` relation.

## Scheduling

`POST /:id/schedule { scheduledAt }` (ISO 8601 with a time zone, at least a minute ahead, at most a year) moves a draft to `SCHEDULED`; calling it again reschedules. The worker looks for due broadcasts every 15 seconds and adds their `start` job; the job ID is fixed per broadcast and the snapshot claims the broadcast atomically (`SCHEDULED → QUEUED`), so several workers, or "send now" racing the scheduler, never start it twice. Schedules live in Postgres, not in Redis: a Redis restart cannot lose them. The dashboard picks the time in the browser's time zone and sends UTC.

## API (`/api/admin/broadcasts`, admin session required)

| Method | Path | |
|---|---|---|
| `GET` | `/` | list (`page`, `limit`, `status`) |
| `POST` | `/` | create a draft: `{ text, imageUrl?, buttonText?, buttonUrl?, segment? }` |
| `POST` | `/audience` | `{ segment }` → `{ count }`: users the segment reaches right now |
| `GET` | `/:id` | broadcast + counters |
| `PATCH` | `/:id` | edit a draft |
| `POST` | `/:id/preview` | send it to yourself only; Telegram errors (e.g. invalid HTML) come back as `400` |
| `POST` | `/:id/schedule` | `{ scheduledAt }`: `DRAFT/SCHEDULED → SCHEDULED` |
| `POST` | `/:id/unschedule` | `SCHEDULED → DRAFT` |
| `POST` | `/:id/start` | send now: `DRAFT/SCHEDULED → QUEUED` |
| `POST` | `/:id/cancel` | `DRAFT/SCHEDULED/QUEUED/RUNNING → CANCELLED` |
| `GET` | `/:id/events` | Server-Sent Events: a `progress` event (`{ status, total, sent, failed, … }`) whenever counters change; the stream ends after a final status |

Limits are validated up front: text ≤ 4096 characters (≤ 1024 with an image) after HTML parsing, button text ≤ 64, URLs `http(s)://` (`tg://` allowed for buttons).

## How sending works

Sending happens in the **worker** process (`main.worker.ts`, decision D2), through two BullMQ queues:

1. **`broadcast-control`** — `start` enqueues one job per broadcast. The worker pages through the segment's users (500 at a time) and enqueues one `send` job each, with a deterministic job ID so a retried snapshot never duplicates a message. Only then does the broadcast become `RUNNING` with its final `total`.
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

**Cancelling** sets the status and adds a `purge` job to the control queue: the worker removes the broadcast's waiting, delayed and retrying messages (job IDs are `<broadcast>-<user>`, so it walks the users instead of scanning the queue), and the next broadcast does not wait behind them. Messages a worker already holds are skipped, because workers re-read the status at least once per second. A snapshot that is still running stops at its next batch.

**Worker liveness.** The worker has no HTTP port; every 10 seconds it checks that its queue workers run and Redis answers, then touches a heartbeat file (`$TMPDIR/tgstack-worker.heartbeat`). The Docker healthcheck fails when the file is older than a minute, and after a minute of failed checks the worker exits so the restart policy brings it back.

## Tuning

- `BROADCAST_RATE_PER_SECOND` (default 25, max 30): Telegram allows roughly 30 messages per second for bulk notifications. Stay below it unless Telegram raised your bot's limits (paid broadcasts).
- Scale the worker horizontally freely: the limiter is global (stored in Redis).
- Each recipient is a Redis job (~1 KB). Completed jobs are removed; plan Redis memory for your largest audience.
