import 'dotenv/config';
import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'http';
import { WebSocketGateway } from './gateway';
import { WebhookHandler } from './webhook';
import { AdminAPI } from './admin';
import { createApp } from './app';

// Validate required environment variables
const REQUIRED_VARS = ['GATEWAY_API_KEY'] as const;
for (const name of REQUIRED_VARS) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`FATAL: ${name} environment variable is required. Set it in Railway dashboard.`);
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || '';
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

// Start heartbeat for WebSocket connections
gateway.startHeartbeat(HEARTBEAT_INTERVAL);

export { app, gateway, webhookHandler, adminAPI };