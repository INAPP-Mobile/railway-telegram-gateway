"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAPI = exports.webhookHandler = exports.gateway = exports.app = void 0;
const dotenv_1 = require("dotenv");
const node_server_1 = require("@hono/node-server");
const gateway_1 = require("./gateway");
const webhook_1 = require("./webhook");
const admin_1 = require("./admin");
const app_1 = require("./app");
(0, dotenv_1.config)();
const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || '';
const HEARTBEAT_INTERVAL = parseInt(process.env.WEBSOCKET_HEARTBEAT_INTERVAL || '30000', 10);
const gateway = new gateway_1.WebSocketGateway(GATEWAY_API_KEY);
exports.gateway = gateway;
const webhookHandler = new webhook_1.WebhookHandler(gateway);
exports.webhookHandler = webhookHandler;
const adminAPI = new admin_1.AdminAPI(webhookHandler, BASE_URL, GATEWAY_API_KEY);
exports.adminAPI = adminAPI;
const app = (0, app_1.createApp)(gateway, webhookHandler, adminAPI);
exports.app = app;
const server = (0, node_server_1.serve)({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`🚀 Railway Telegram Gateway listening on port ${info.port}`);
    if (!GATEWAY_API_KEY) {
        console.warn('⚠️  GATEWAY_API_KEY not set — admin endpoints are unprotected!');
    }
});
gateway.createWSServer(server);
gateway.startHeartbeat(HEARTBEAT_INTERVAL);
//# sourceMappingURL=index.js.map