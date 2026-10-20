import 'dotenv/config';
import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'http';
import { WebSocketGateway } from './gateway';
import { WebhookHandler } from './webhook';
import { AdminAPI } from './admin';
import { createApp } from './app';
import { BotSendRateLimiter, RateLimiterOptions } from './rate-limiter';
import { BotStore } from './store';
import { Outbox } from './outbox';
import { OutboxWorker } from './outbox-worker';
import type { OutboxRecord } from './types';
import { join } from 'path';

import crypto from 'crypto';

// Generate a random API key if none is provided
// Users should set their own GATEWAY_API_KEY in Railway dashboard
const RAW_API_KEY = process.env.GATEWAY_API_KEY?.trim() || '';
const GATEWAY_API_KEY = RAW_API_KEY || `gw-${crypto.randomBytes(16).toString('hex')}`;

if (!RAW_API_KEY) {
  console.warn('⚠️  GATEWAY_API_KEY not set. A random key was generated for this session.');
  console.warn(`   Generated key: ${GATEWAY_API_KEY}`);
  console.warn(`   Set GATEWAY_API_KEY in your Railway dashboard to use a persistent key.`);
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const HEARTBEAT_INTERVAL = parseInt(process.env.WEBSOCKET_HEARTBEAT_INTERVAL || '30000', 10);

// Bot registry persistence. On Railway the volume mount point arrives as
// RAILWAY_VOLUME_MOUNT_PATH; default to a local ./data dir otherwise.
const DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  process.env.GATEWAY_DATA_DIR ||
  join(process.cwd(), 'data');
const DATABASE_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'bots.db');

// Telegram send rate limits (per bot, enforced in-process on this single replica).
// See src/rate-limiter.ts for defaults and rationale.
const intEnv = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const rlOptions: RateLimiterOptions = {
  globalRatePerSec: intEnv(process.env.RATE_LIMIT_GLOBAL_PER_SEC, 29),
  chatRatePerSec: intEnv(process.env.RATE_LIMIT_CHAT_PER_SEC, 1),
  chatWindowCap: intEnv(process.env.RATE_LIMIT_CHAT_WINDOW_CAP, 20),
  chatWindowMs: intEnv(process.env.RATE_LIMIT_CHAT_WINDOW_MS, 120_000),
  maxRetries: intEnv(process.env.RATE_LIMIT_MAX_RETRIES, 3),
  maxRetryAfterMs: intEnv(process.env.RATE_LIMIT_MAX_RETRY_AFTER_MS, 60_000),
};

// Outbound outbox worker tuning (background drainer that paces sends to Telegram).
const outboxPollMs = intEnv(process.env.OUTBOX_POLL_MS, 250);
const outboxBatch = intEnv(process.env.OUTBOX_BATCH, 32);
const outboxMaxAttempts = intEnv(process.env.OUTBOX_MAX_ATTEMPTS, 5);
const outboxBaseDelayMs = intEnv(process.env.OUTBOX_BASE_DELAY_MS, 30_000);
const outboxBaseFactor = parseFloat(process.env.OUTBOX_BASE_FACTOR || '1.5');
const outboxMaxDelayMs = intEnv(process.env.OUTBOX_MAX_DELAY_MS, 300_000);

// Instantiate core components
const gateway = new WebSocketGateway(GATEWAY_API_KEY);
const rateLimiter = new BotSendRateLimiter(rlOptions);
const webhookHandler = new WebhookHandler(gateway, rateLimiter);
const store = new BotStore(DATABASE_PATH);
const outbox = new Outbox(DATABASE_PATH);
webhookHandler.setOutbox(outbox);
const adminAPI = new AdminAPI(webhookHandler, BASE_URL, GATEWAY_API_KEY, store);

// Build Hono app with routes
const app = createApp(gateway, webhookHandler, adminAPI);

// Outbound worker: single-drain delivery of the durable outbox, pacing sends
// through webhookHandler.dispatch (which routes through the rate limiter).
// The worker dead-letters messages whose bot has been deregistered and
// otherwise backoff/retries per the maxAttempts policy.
const outboxWorker = new OutboxWorker(
  outbox,
  (rec) => webhookHandler.dispatch(rec.botId, rec.chatId, rec.text, rec.options ?? undefined),
  (event) => gateway.publishOutboxEvent(event),
  {
    pollIntervalMs: outboxPollMs,
    batchLimit: outboxBatch,
    maxAttempts: outboxMaxAttempts,
    baseDelayMs: outboxBaseDelayMs,
    baseFactor: Number.isFinite(outboxBaseFactor) && outboxBaseFactor > 0 ? outboxBaseFactor : 1.5,
    maxDelayMs: outboxMaxDelayMs,
    log: (msg) => console.log(msg),
  },
);

// Restore persisted bots on boot: re-attach in-process Telegraf instances and
// (re)point Telegram's webhooks at this deployment. Deliberately not awaited —
// a single flaky bot must never block the HTTP server from coming up, and
// restoreBot never throws by design.
void adminAPI.restoreAllBots().then((r) => {
  if (r.total === 0) {
    console.log('[bootstrap] no persisted bots to restore');
  } else {
    console.log(
      `[bootstrap] restored ${r.restored}/${r.total} bot(s)` +
        (r.failed ? ` (${r.failed} failed — see logs)` : ''),
    );
  }
  // Recover outbox rows stranded in `pending` by a previously crashed worker,
  // then start draining. We begin after restore so the bot is attached before
  // the first dispatch attempt (still safe if a bot fails to restore: the
  // worker retries with backoff per the maxAttempts policy).
  outboxWorker.recoverOrphans();
  const c = outbox.statusCounts();
  if (c.queued + c.pending + c.sent + c.failed > 0) {
    console.log(
      `[outbox] starting — ${c.queued} queued, ${c.pending} in flight, ${c.sent} sent, ${c.failed} dead-lettered`,
    );
  }
  outboxWorker.start();
});

// Create HTTP server via @hono/node-server (returns Node http.Server)
const server = serve(
  { fetch: app.fetch, port: PORT },
  (info: { port: number }) => {
    console.log(`🚀 Railway Telegram Gateway listening on port ${info.port}`);
  }
);

// Attach WebSocket server to the underlying Node HTTP server
gateway.createWSServer(server);

// Wire up sendMessage handler so WebSocket clients can send Telegram messages
gateway.setSendMessageHandler((botId, chatId, text, options) =>
  webhookHandler.sendMessage(botId, chatId, text, options)
);

// Start heartbeat for WebSocket connections
gateway.startHeartbeat(HEARTBEAT_INTERVAL);

// Graceful shutdown: stop the outbox worker (finishes any in-flight batch), let
// it persist terminal states, then close the shared SQLite DB. The process is
// otherwise long-lived; Railway sends SIGTERM on scale-to-zero/redeploy which
// triggers this.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — draining outbox worker`);
  gateway.stopHeartbeat();
  try {
    server.close();
  } catch {
    // already closed
  }
  // Hard-exit backstop so a stuck dispatch can't hold the process forever.
  const hardExit = setTimeout(() => {
    console.warn('[shutdown] forcing exit after grace window');
    process.exit(1);
  }, 15_000);
  hardExit.unref?.();
  try {
    await outboxWorker.stop();
  } finally {
    try {
      outbox.close();
    } catch {
      // already closed
    }
    try {
      store.close();
    } catch {
      // already closed
    }
  }
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

export { app, gateway, webhookHandler, adminAPI, outbox, outboxWorker };