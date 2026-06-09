# Railway Telegram Gateway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/railway-telegram-gateway)

A real-time Telegram bot update gateway. Register multiple Telegram bots via REST API, receive their webhook updates, and stream them to WebSocket clients — all in one Railway deployment.

No polling, no public bot IPs needed, no infrastructure wrangling. Just bots → webhook → WebSocket.

## How It Works

```
                     ┌───────────────────────────────────┐
                     │     Railway Telegram Gateway       │
                     │                                   │
  Telegram Bot A ───▶│  /webhook/bot/:id  ──▶  Gateway  │──▶ WebSocket Client A
  Telegram Bot B ───▶│                        Dispatch │──▶ WebSocket Client B
                     │                                   │◀── sendMessage ◀──┐
                     │  /admin/bots  (REST API)          │                   │
                     │  /ws?token=   (WebSocket)         │───────────────────┘
                     └───────────────────────────────────┘
```

1. **Register** a bot via the Admin API with its Telegram bot token
2. Gateway auto-configures the Telegram webhook URL for that bot
3. Telegram sends updates (messages, callbacks, channel posts) to the gateway
4. Gateway dispatches updates over WebSocket to subscribed clients

## Quick Deploy

| Step | Action |
|------|--------|
| 1 | Click **Deploy on Railway** above |
| 2 | Set `GATEWAY_API_KEY` in Railway dashboard (**required**) |
| 3 | Deploy — the app fails fast if required vars are missing |
| 4 | Use the Admin API to register your Telegram bots |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_API_KEY` | ✅ Yes | — | Auth key for WebSocket clients & Admin API. Accepts comma-separated keys. |
| `BASE_URL` | ❌ No | `http://localhost:${PORT}` | Public URL used when setting bot webhooks via the Telegram API (auto-configured on Railway) |
| `WEBHOOK_SECRET` | ❌ No | — | Optional secret for Telegram webhook verification |
| `SUBSCRIPTION_MAX_PER_CLIENT` | ❌ No | `10` | Max bot subscriptions per WebSocket client |
| `WEBSOCKET_HEARTBEAT_INTERVAL` | ❌ No | `30000` | WebSocket ping interval (ms) |
| `SKIP_BOT_VALIDATION` | ❌ No | `false` | Skip Telegram `getMe` validation (use `true` for local dev) |
| `PORT` | ❌ No | `3000` | Server port (Railway sets this automatically) |

## API Reference

### Admin API — Bot Registration

All admin routes require `X-API-Key: <GATEWAY_API_KEY>` header.

#### Register a Bot

```http
POST /admin/bots
Content-Type: application/json
X-API-Key: your-api-key

{
  "token": "1234567890:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "name": "My Bot"
}
```

Response: `{ "botId": "1234567890", "status": "registered" }`

This:
- Validates the bot token via Telegram's `getMe`
- Registers the bot webhook with Telegram (URL = `<BASE_URL>/webhook/bot/<botId>`)
- Makes the bot available for WebSocket subscriptions

#### List Registered Bots

```http
GET /admin/bots
X-API-Key: your-api-key
```

#### Unregister a Bot

```http
DELETE /admin/bots/:botId
X-API-Key: your-api-key
```

Response: `{ "status": "unregistered" }`

Removes the webhook from Telegram and stops dispatching updates.

### WebSocket Gateway

Connect at `wss://your-domain.com/?token=<GATEWAY_API_KEY>`.

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
| Receive | `{ "type": "sent", "botId": "...", "ok": true }` | Confirmation of sent message |
| Send | `{ "type": "sendMessage", "botId": "...", "chatId": 123, "text": "Hi", "parse_mode": "HTML" }` | Send with formatting options |

### Update Payload

The `payload` field contains the raw [Telegram Update object](https://core.telegram.org/bots/api#update) — messages, edited messages, callback queries, channel posts, etc.

## Use Cases

- **Multi-bot dashboard** — Subscribe to multiple Telegram bots from one WebSocket connection
- **Real-time chat monitoring** — Stream bot conversations to a UI in real time
- **Bot analytics pipeline** — Pipe Telegram updates into a data pipeline or storage
- **Multi-tenant bot platform** — Register/unregister bots dynamically via API without redeploying
- **Serverless bot extension** — Offload webhook processing to a gateway and handle logic elsewhere

## Local Development

```bash
cp .env.example .env
# Edit .env: set GATEWAY_API_KEY, SKIP_BOT_VALIDATION=true, PORT=3000
npm install
npm run dev
```

## Architecture

- **Runtime:** Node.js 22, TypeScript
- **HTTP framework:** [Hono](https://hono.dev/) — fast, lightweight
- **Telegram SDK:** [Telegraf](https://telegraf.js.org/) — webhook update handling
- **WebSocket:** [ws](https://github.com/websockets/ws) — real-time client streaming
- **Deployment:** Docker multi-stage build, ~65MB final image
- **State:** In-memory (stateless; Railway handles horizontal scaling)

## Client SDK

A TypeScript/React client SDK is available in [`client-sdk/`](client-sdk/). It handles:
- WebSocket reconnection with exponential backoff
- Automatic heartbeat
- Typed subscription management
- React hooks for consuming updates
- `sendMessage()` for sending Telegram messages over the WebSocket

## Deploy and Host railway-telegram-gateway

Source: [https://github.com/INAPP-Mobile/railway-telegram-gateway](https://github.com/INAPP-Mobile/railway-telegram-gateway)

### About Hosting

Multi-bot Telegram webhook gateway with real-time WebSocket event streaming and bidirectional messaging. Register Telegram bots via Admin API, stream their updates to WebSocket clients, and send messages back through the same connection — all in one Railway deployment.

### Why Deploy

Deploy railway-telegram-gateway on Railway with one click. Get instant HTTPS, automatic scaling, and zero-config infrastructure — no Docker or Kubernetes knowledge required.

### Common Use Cases

- Quick deployment for development and staging environments
- Production-ready hosting with automatic HTTPS and scaling
- One-click shareable demo environments
- Bots application hosting with minimal configuration

### Dependencies for

#### Deployment Dependencies

Railway automatically detects your project's runtime and provisions the necessary infrastructure. No additional dependencies required.

## License

MIT — by [INAPP](https://github.com/INAPP-Mobile)
