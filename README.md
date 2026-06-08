---
description: Railway Telegram Gateway - multi-bot webhook to WebSocket gateway for Railway
created: 2026-06-08
---# Railway Telegram Gateway

<p align="center">
  <a href="https://railway.com/deploy">
    <img src="https://railway.com/button.svg" width="174" />
  </a>
</p>

## Overview

A WebSocket gateway that receives **Telegram bot webhooks** and streams updates to connected clients over WebSocket. Designed for deployment on [Railway](https://railway.app) as a multi-bot architecture — register bots via Admin API, subscribe clients in real-time.

---

## Architecture

```
Telegram → [Webhook Endpoint] → Telegraf Bot → Gateway (update dispatch)
                              ↓
WebSocket Clients (subscribe per botId)
              │
     ┌───────┴────────┐
     ▼                ▼
  Client A         Client B
(subscribed to    (subscribed to
bot X updates)    bot Y updates)
```

---

## Quick Deploy

1. Click the **Deploy on Railway** button above
2. Set `GATEWAY_API_KEY` in your Railway app settings (**required**)
3. Optionally set `WEBHOOK_SECRET`, `BASE_URL`, and `SUBSCRIPTION_MAX_PER_CLIENT`
4. Redeploy to apply env var changes
5. Use the Admin API to register bots

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_API_KEY` | ✅ Yes | — | Primary auth key for WebSocket client connections. Accepts comma-separated values (e.g., `"key1,key2"`). |
| `WEBHOOK_SECRET` | ❌ No | — | Verify webhook integrity from Telegram via `X-Telegram-Bot-Secret` header |
| `BASE_URL` | ❌ No | `http://localhost:${PORT}` | Base URL for admin webhook config (sets bot webhook URLs via Telegram API) |
| `SUBSCRIPTION_MAX_PER_CLIENT` | ❌ No | `10` | Max concurrent bot subscriptions per WebSocket client |
| `WEBSOCKET_HEARTBEAT_INTERVAL` | ❌ No | `30000` (30s) | Interval for WebSocket heartbeat pings |
| `PORT` | ✅ Auto | Railway sets → 8080 | Web server port. Set `3000` for local dev. Defaults to the `PORT` env variable set by Railway at runtime |

---

## API Reference

### Bot Management (Admin API)

All admin routes require **`X-API-Key: <GATEWAY_API_KEY>`** header.

#### Register a Bot
```http
POST /admin/bots
Content-Type: application/json
X-API-Key: your-api-key

{
  "token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "name": "My Telegram Bot"
}
```
**Response:** `201 Created` → `{ "botId": "123456789", "status": "registered" }`

#### List Registered Bots
```http
GET /admin/bots
X-API-Key: your-api-key
```
**Response:** `200 OK` → `{ "bots": [{ "botId": "...", "name": "...", "status": "active", ... }] }`

#### Unregister a Bot
```http
DELETE /admin/bots/:botId
X-API-Key: your-api-key
```
**Response:** `200 OK` → `{ "status": "unregistered" }`

### WebSocket Gateway

Connect to the **WebSocket Gateway** at path `/`: `wss://your-domain.com/?token=<GATEWAY_API_KEY>`

#### Subscribe to Bot Updates
Send: `{ "type": "subscribe", "botId": "123456789" }`  
Response: `{ "type": "subscribed", "botId": "123456789" }`

#### Unsubscribe from Bot Updates
Send: `{ "type": "unsubscribe", "botId": "123456789" }`  
Response: `{ "type": "unsubscribed", "botId": "123456789" }`

#### Ping / Heartbeat
Send: `{ "type": "ping" }`  
Response: `{ "type": "pong" }`

### Webhook Receiver (for Client Updates)

All bot updates are sent over the WebSocket connection. Bot registration via Admin API auto-configures webhook URLs.

**Update Payload Format:**
```json
{
  "type": "update",
  "botId": "123456789",
  "payload": { /* Telegram Update object */ }
}
```

---

## Usage Examples

### Register a Bot (curl)
```bash
curl -X POST http://localhost:3000/admin/bots \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"token":"123456789:BOT_TOKEN","name":"MyBot"}'
```

### Listen for Updates (Node.js)
```javascript
const ws = new WebSocket('wss://your-domain.com/?token=your-api-key');

ws.on('open', () => {
  // subscribe to bot updates
  ws.send(JSON.stringify({ type: 'subscribe', botId: '123456789' }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'update') {
    console.log(`[${msg.botId}] update:`, msg.payload);
  }
});
```

---

## Client SDK

A TypeScript client is available in the `client-sdk/` directory for consuming this gateway. It handles auth, reconnection, heartbeat, and message forwarding automatically.

### Using the React SDK
```bash
npm install telegram-gateway-client-sdk # or your package manager
```

---

## Development & Production Configuration

### Local development:
```bash
cp .env.example .env
# Edit .env with your values
npm run dev  # Watches and restarts on source changes
```

### Docker:
```bash
docker build -t telegram-gateway .
docker run -p 3000:8080 --env-file .env telegram-gateway:latest
```

### Railway deployment:
1. Click **Deploy on Railway** button above
2. Set `GATEWAY_API_KEY` (**required**) in your Railway app settings
3. Re-deploy to apply changes — the app will fail fast if required env vars are missing at startup

---

## License

MIT