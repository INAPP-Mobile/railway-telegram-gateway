import { config } from 'dotenv';
import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'http';
import { WebSocketGateway } from './gateway';
import { WebhookHandler } from './webhook';
import { AdminAPI } from './admin';
import { createApp } from './app';

// Load environment variables
config();

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
    if (!GATEWAY_API_KEY) {
      console.warn('⚠️  GATEWAY_API_KEY not set — admin endpoints are unprotected!');
    }
  }
);

// Attach WebSocket server to the underlying Node HTTP server
gateway.createWSServer(server);

// Start heartbeat for WebSocket connections
gateway.startHeartbeat(HEARTBEAT_INTERVAL);

export { app, gateway, webhookHandler, adminAPI };
