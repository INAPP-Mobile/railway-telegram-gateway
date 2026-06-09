"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketGateway = void 0;
const ws_1 = require("ws");
class WebSocketGateway {
    subscriptions = new Map();
    clients = new Map();
    apiKeys;
    heartbeatInterval = null;
    constructor(apiKeysEnv) {
        this.apiKeys = new Set(apiKeysEnv.split(',').map(k => k.trim()).filter(Boolean));
    }
    verifyClient(token) {
        if (!token)
            return false;
        return this.apiKeys.has(token);
    }
    subscribe(ws, botId) {
        if (!this.subscriptions.has(botId)) {
            this.subscriptions.set(botId, new Set());
        }
        this.subscriptions.get(botId).add(ws);
        const client = this.clients.get(ws);
        if (client) {
            client.subscriptions.add(botId);
        }
    }
    unsubscribe(ws, botId) {
        const subs = this.subscriptions.get(botId);
        if (subs) {
            subs.delete(ws);
        }
        const client = this.clients.get(ws);
        if (client) {
            client.subscriptions.delete(botId);
        }
    }
    dispatchUpdate(botId, payload) {
        const subscribers = this.subscriptions.get(botId);
        if (!subscribers || subscribers.size === 0)
            return;
        const message = JSON.stringify({ type: 'update', botId, payload });
        subscribers.forEach(ws => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }
    handleMessage(ws, message) {
        switch (message.type) {
            case 'subscribe':
                if (message.botId) {
                    this.subscribe(ws, message.botId);
                    ws.send(JSON.stringify({ type: 'subscribed', botId: message.botId }));
                }
                break;
            case 'unsubscribe':
                if (message.botId) {
                    this.unsubscribe(ws, message.botId);
                    ws.send(JSON.stringify({ type: 'unsubscribed', botId: message.botId }));
                }
                break;
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong' }));
                break;
        }
    }
    registerClient(ws, token) {
        this.clients.set(ws, { token, subscriptions: new Set() });
    }
    unregisterClient(ws) {
        const client = this.clients.get(ws);
        if (client) {
            client.subscriptions.forEach(botId => {
                this.unsubscribe(ws, botId);
            });
            this.clients.delete(ws);
        }
    }
    startHeartbeat(intervalMs = 30000) {
        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((_, ws) => {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.ping();
                }
            });
        }, intervalMs);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    createWSServer(server) {
        const wss = new ws_1.WebSocketServer({ server });
        wss.on('connection', (ws, request) => {
            const url = new URL(request.url || '', `http://${request.headers.host}`);
            const token = url.searchParams.get('token') || undefined;
            this.registerClient(ws, token);
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'subscribe' && message.token && !token) {
                        const existing = this.clients.get(ws);
                        if (existing && !existing.token) {
                            if (!this.apiKeys.has(message.token)) {
                                ws.send(JSON.stringify({ type: 'error', message: 'Invalid auth token' }));
                                return;
                            }
                            existing.token = message.token;
                        }
                    }
                    this.handleMessage(ws, message);
                }
                catch (e) {
                }
            });
            ws.on('close', () => {
                this.unregisterClient(ws);
            });
        });
        return wss;
    }
}
exports.WebSocketGateway = WebSocketGateway;
//# sourceMappingURL=gateway.js.map