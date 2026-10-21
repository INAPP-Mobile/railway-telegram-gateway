# Railway Telegram Gateway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/railway-telegram-gateway)

A real-time Telegram bot update gateway. Register multiple Telegram bots via a REST API, receive their webhook updates, and stream them to WebSocket clients — all in one Railway deployment.

No polling, no public bot IPs needed, no infrastructure wrangling. Just bots → webhook → WebSocket.

## Features

- **Multi-bot, one deployment** — register any number of bots at runtime; no redeploy per bot
- **Webhook in, WebSocket out** — Telegram posts updates to the gateway, which streams them to subscribed clients
- **Bidirectional** — clients send messages back through the same WebSocket connection
- **Durable outbound queue** — sends are persisted in SQLite and retried with exponential backoff, so a restart or redeploy doesn't drop messages
- **Telegram rate-limit aware** — per-bot and per-chat pacing, honoring `retry_after` on HTTP 429
- **Persistent bot registry** — registered bots are re-attached and their webhooks re-pointed on boot
- **Authenticated** — every bot-scoped WebSocket action and all Admin API routes require `GATEWAY_API_KEY`

## How It Works

```
                     ┌───────────────────────────────────┐
                     │     Railway Telegram Gateway      │
                     │                                   │
  Telegram Bot A ───▶│  /webhook/bot/:id  ──▶  Gateway   │──▶ WebSocket Client A
  Telegram Bot B ───▶│                        Dispatch   │──▶ WebSocket Client B
                     │                                   │◀── sendMessage ◀──┐
                     │  /admin/bots  (REST API)          │                   │
                     │  /ws?token=   (WebSocket)         │───────────────────┘
                     └───────────────────────────────────┘
```

1. **Register** a bot via the Admin API with its Telegram bot token
2. The gateway validates the token and points that bot's Telegram webhook at `<BASE_URL>/webhook/bot/<botId>`
3. Telegram posts updates (messages, callbacks, channel posts) to the gateway
4. The gateway dispatches each update over WebSocket to clients subscribed to that bot
5. Clients can send messages back; sends are queued durably and delivered under rate limits

## Quick Deploy

| Step | Action |
|------|--------|
| 1 | Click **Deploy on Railway** above |
| 2 | Set `GATEWAY_API_KEY` to a strong unique value |
| 3 | Deploy — Railway provisions HTTPS and a public domain automatically |
| 4 | *(Recommended)* Attach a volume so the bot registry and outbound queue survive redeploys |
| 5 | Register your first bot with `POST /admin/bots` |
| 6 | Connect a client to `wss://<your-domain>/ws?token=<GATEWAY_API_KEY>` |

> **Set `GATEWAY_API_KEY` yourself.** If unset, the app generates a random key at boot and logs it. That key changes on every restart, so clients and the Admin API would break on redeploy.

> **Attach a volume for durability.** Without one, SQLite lives in the container filesystem: registered bots need re-registering and queued messages are lost on redeploy. Railway sets `RAILWAY_VOLUME_MOUNT_PATH` when a volume is mounted, and the gateway writes `bots.db` there automatically.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_API_KEY` | ✅ Yes | random per boot | Auth key for the WebSocket and Admin API. Comma-separated list accepted, for key rotation. |
| `BASE_URL` | ❌ No | Railway public domain, else `http://localhost:${PORT}` | Public URL used to register bot webhooks. Set only to pin a custom domain. |
| `DATABASE_PATH` | ❌ No | `<data dir>/bots.db` | Explicit SQLite path. Overrides the volume-derived location. |
| `GATEWAY_DATA_DIR` | ❌ No | volume mount path, else `./data` | Data directory used when no volume is attached. |
| `PORT` | ❌ No | `3000` | Server port (Railway sets this). |
| `WEBSOCKET_HEARTBEAT_INTERVAL` | ❌ No | `30000` | WebSocket ping interval (ms). |
| `SKIP_BOT_VALIDATION` | ❌ No | `false` | Skip the Telegram `getMe` check. Use `true` only for local dev. |
| `RATE_LIMIT_GLOBAL_PER_SEC` | ❌ No | `29` | Sustained sends/second per bot (Telegram's cap is 30/s). |
| `RATE_LIMIT_CHAT_PER_SEC` | ❌ No | `1` | Sustained sends/second per chat. |
| `RATE_LIMIT_CHAT_WINDOW_CAP` | ❌ No | `20` | Max per-chat sends per `RATE_LIMIT_CHAT_WINDOW_MS` (Telegram resets a 20–30 message window). |
| `RATE_LIMIT_CHAT_WINDOW_MS` | ❌ No | `120000` | Sliding window length for the per-chat cap (ms). |
| `RATE_LIMIT_MAX_RETRIES` | ❌ No | `3` | Retries after an HTTP 429 before surfacing the error. |
| `RATE_LIMIT_MAX_RETRY_AFTER_MS` | ❌ No | `60000` | Cap on a single `retry_after` sleep (ms). |
| `OUTBOX_POLL_MS` | ❌ No | `250` | How often the worker scans for due messages (ms). |
| `OUTBOX_BATCH` | ❌ No | `32` | Max messages claimed per drain. |
| `OUTBOX_MAX_ATTEMPTS` | ❌ No | `5` | Delivery attempts before a message is dead-lettered. |
| `OUTBOX_BASE_DELAY_MS` | ❌ No | `30000` | First retry delay (ms). |
| `OUTBOX_BASE_FACTOR` | ❌ No | `1.5` | Multiplier applied per retry. |
| `OUTBOX_MAX_DELAY_MS` | ❌ No | `300000` | Ceiling on any single backoff (ms). |

## API Reference

### Admin API — Bot Registration

All admin routes require an `X-API-Key: <GATEWAY_API_KEY>` header.

#### Register a Bot

```http
POST /admin/bots
Content-Type: application/json
X-API-Key: <GATEWAY_API_KEY>

{
  "token": "1234567890:<bot-token>",
  "name": "My Bot"
}
```

Response: `{ "botId": "1234567890", "status": "registered" }`

This:
- Validates the bot token via Telegram's `getMe`
- Registers the bot webhook with Telegram (URL = `<BASE_URL>/webhook/bot/<botId>`)
- Attaches the bot in-process so it can receive updates
- Persists it, so it survives a restart

Registration is idempotent: re-posting the same bot re-points its webhook.

Errors are caller-correctable where they can be:

| Status | Meaning |
|--------|---------|
| `400` | Missing or invalid bot token |
| `401` | Missing or wrong `X-API-Key` |
| `422` | Telegram rejected the webhook URL (usually `BASE_URL` is unreachable) |

#### List Registered Bots

```http
GET /admin/bots
X-API-Key: <GATEWAY_API_KEY>
```

Returns each bot's `botId`, `name`, `status` (`active` or `error`), `userId`, and `registeredAt`.

#### Unregister a Bot

```http
DELETE /admin/bots/:botId
X-API-Key: <GATEWAY_API_KEY>
```

Response: `{ "status": "unregistered" }`

Deletes the Telegram webhook, detaches the bot, and removes it from the registry. Messages already queued for that bot are dead-lettered immediately rather than retried.

### WebSocket Gateway

Connect to `wss://<your-domain>/ws?token=<GATEWAY_API_KEY>`.

**Both WebSocket auth styles are supported:**

- `?token=<GATEWAY_API_KEY>` on the connect URL (recommended — what the SDK does)
- `token` in the `subscribe` frame, for clients that can't put credentials in a URL

A **wrong** token in the URL is rejected with HTTP 401 before the socket opens. A connection with no token may open, but every bot-scoped frame (`subscribe`, `unsubscribe`, `sendMessage`) is refused with an `error` frame until the key is proven by one of the two routes. `ping` is always allowed so liveness checks work pre-auth.

| Direction | Message | Description |
|-----------|---------|-------------|
| Send | `{ "type": "subscribe", "botId": "1234567890" }` | Subscribe to a bot's updates |
| Receive | `{ "type": "subscribed", "botId": "1234567890" }` | Confirmation |
| Send | `{ "type": "unsubscribe", "botId": "1234567890" }` | Unsubscribe |
| Receive | `{ "type": "unsubscribed", "botId": "1234567890" }` | Confirmation |
| Send | `{ "type": "ping" }` | Heartbeat |
| Receive | `{ "type": "pong" }` | Heartbeat response |
| Receive | `{ "type": "update", "botId": "...", "payload": {...} }` | Telegram update event |
| Send | `{ "type": "sendMessage", "botId": "...", "chatId": 123, "text": "Hello" }` | Send a Telegram message from a registered bot |
| Receive | `{ "type": "sent", "botId": "...", "ok": true, "queued": false, "messageId": 42 }` | Send accepted |
| Send | `{ "type": "sendMessage", "botId": "...", "chatId": 123, "text": "Hi", "parse_mode": "HTML" }` | Send with formatting options |

`sendMessage` also accepts `disable_web_page_preview`, `disable_notification`, and `reply_to_message_id`.

The `sent` reply distinguishes three outcomes:

- `{ "ok": true, "queued": false, "messageId": N }` — delivered to Telegram synchronously
- `{ "ok": true, "queued": true, "messageId": N }` — accepted into the durable queue; `messageId` is the queue id and delivery is confirmed by an outbox status event
- `{ "ok": false, "error": "..." }` — rejected (for example, the bot isn't registered)

Outbox lifecycle events go to clients subscribed to that bot:

```json
{ "type": "outbox", "botId": "1234567890", "messageId": 42, "status": "sent" }
```

`status` is `sent` or `failed`. A `failed` event means the message exhausted its retry budget and was dead-lettered; `error` carries the reason.

### Update Payload

The `payload` field is the raw [Telegram Update object](https://core.telegram.org/bots/api#update) — messages, edited messages, callback queries, channel posts, and so on.

## Persistence and Scaling

The gateway is designed for a **single replica**. In-flight state (attached Telegraf instances, WebSocket subscriptions) is per-process, and rate-limiter buckets are in memory.

Two things survive a restart because they live in SQLite:

- the **bot registry** — re-attached and webhooks re-pointed on boot
- the **outbound queue** — messages caught mid-send are recovered and retried

To run multiple replicas you need a shared store and a fan-out mechanism; see `doc/multi-replica.md`. Note that a second replica would not receive Telegram webhooks for bots whose webhook points at the first.

## Local Development

```bash
cp .env.example .env
# Edit .env: set GATEWAY_API_KEY and SKIP_BOT_VALIDATION=true, or use a real bot token
npm install
npm run dev
```

Then, with the server on `http://localhost:3000`:

```bash
curl -X POST http://localhost:3000/admin/bots \
  -H "X-API-Key: $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"token":"1234567890:<bot-token>","name":"Local Bot"}'
```

Run the test suite with `npm test`.

## Architecture

- **Runtime:** Node.js 22, TypeScript
- **HTTP framework:** [Hono](https://hono.dev/) — fast, lightweight
- **Telegram SDK:** [Telegraf](https://telegraf.js.org/) — webhook update handling
- **WebSocket:** [ws](https://github.com/websockets/ws) — real-time client streaming, authenticated at upgrade
- **Persistence:** SQLite via `node:sqlite` — bot registry and durable outbox in one file
- **Deployment:** Docker multi-stage build
- **Outbound messaging:** per-bot token bucket (~29/s) + per-chat bucket (~1/s) + sliding window cap, with 429 `retry_after` backoff (`src/rate-limiter.ts`), behind a retrying queue (`src/outbox-worker.ts`)

## Client SDK

A TypeScript/React client SDK is published on npm as [`telegram-gateway-client`](https://www.npmjs.com/package/telegram-gateway-client).

```bash
npm install telegram-gateway-client
```

It handles:
- WebSocket reconnection with exponential backoff
- Automatic heartbeat
- Typed subscription management
- React hooks for consuming updates
- `sendMessage()` for sending Telegram messages over the WebSocket

Source code is in [`client-sdk/`](client-sdk/).

## Use Cases

- **Multi-bot dashboard** — subscribe to several bots from one WebSocket connection
- **Real-time chat monitoring** — stream bot conversations to a UI as they happen
- **Bot analytics pipeline** — pipe Telegram updates into a data pipeline or warehouse
- **Multi-tenant bot platform** — register and unregister bots dynamically without redeploying
- **Serverless bot extension** — offload webhook handling to the gateway and keep bot logic elsewhere

## Deploy and Host railway-telegram-gateway

Source: [https://github.com/INAPP-Mobile/railway-telegram-gateway](https://github.com/INAPP-Mobile/railway-telegram-gateway)

### About Hosting

Multi-bot Telegram webhook gateway with real-time WebSocket event streaming and bidirectional messaging. Register Telegram bots via the Admin API, stream their updates to WebSocket clients, and send messages back over the same connection — all in one Railway deployment.

### Why Deploy

Deploy railway-telegram-gateway on Railway with one click. Get instant HTTPS, an automatic public domain, and a persistent volume for the bot registry and outbound queue — no Docker or Kubernetes knowledge required.

### Common Use Cases

- Quick deployment for development and staging environments
- Production hosting for a multi-tenant Telegram bot backend
- One-click shareable demo environments
- Bot infrastructure with minimal configuration

### Dependencies for railway-telegram-gateway

#### Deployment Dependencies

Railway builds the included `Dockerfile`. No external services are required — the gateway keeps its state in a local SQLite file and talks only to the Telegram Bot API. Attach a Railway volume to make that state durable across redeploys.

## License

MIT — by [INAPP](https://github.com/INAPP-Mobile)
