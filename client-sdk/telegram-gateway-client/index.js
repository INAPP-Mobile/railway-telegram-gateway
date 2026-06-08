"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramGatewayClient = void 0;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
class TelegramGatewayClient {
    ws = null;
    url;
    authToken;
    callback = null;
    reconnectAttempt = 0;
    reconnectTimer = null;
    shouldReconnect = true;
    subscriptions = new Set();
    constructor(url, authToken) {
        this.url = url;
        this.authToken = authToken;
    }
    subscribe(botId) {
        this.subscriptions.add(botId);
        this.send({ type: 'subscribe', botId });
    }
    unsubscribe(botId) {
        this.subscriptions.delete(botId);
        this.send({ type: 'unsubscribe', botId });
    }
    onUpdate(callback) {
        this.callback = callback;
    }
    connect() {
        this.shouldReconnect = true;
        const wsUrl = `${this.url}?token=${this.authToken}`;
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = () => {
            this.reconnectAttempt = 0;
            for (const botId of this.subscriptions) {
                this.send({ type: 'subscribe', botId });
            }
        };
        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'update' && msg.botId && msg.payload) {
                    this.callback?.(msg.botId, msg.payload);
                }
            }
            catch {
            }
        };
        this.ws.onclose = () => {
            this.ws = null;
            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }
        };
        this.ws.onerror = () => {
            this.ws?.close();
        };
    }
    close() {
        this.shouldReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.ws?.close();
        this.ws = null;
    }
    send(msg) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
    scheduleReconnect() {
        const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
        this.reconnectAttempt++;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
}
exports.TelegramGatewayClient = TelegramGatewayClient;
//# sourceMappingURL=index.js.map