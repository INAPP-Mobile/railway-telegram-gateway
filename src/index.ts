import 'dotenv/config';
import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'http';
import { WebSocketGateway } from './gateway';
import { WebhookHandler } from './webhook';
import { AdminAPI } from './admin';
import { createApp } from './app';

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

// Instantiate core components
const gateway = new WebSocketGateway(GATEWAY_API_KEY);
const webhookHandler = new WebhookHandler(gateway);
const adminAPI = new AdminAPI(webhookHandler, BASE_URL, GATEWAY_API_KEY);

// Build Hono app with routes
const app = createApp(gateway, webhookHandler, adminAPI);

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

export { app, gateway, webhookHandler, adminAPI };