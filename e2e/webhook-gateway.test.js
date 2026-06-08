"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const TEST_PORT = process.env.PORT || '3000';
const BASE_URL = `http://localhost:${TEST_PORT}`;
test_1.test.describe('Railway Telegram Gateway', () => {
    test_1.test.describe('Admin API - Bot Management', () => {
        const API_KEY = process.env.GATEWAY_API_KEY || 'test-api-key';
        (0, test_1.test)('should register a bot via POST /admin/bots', async ({ request }) => {
            const mockToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
            const response = await request.post(`${BASE_URL}/admin/bots`, {
                headers: { 'x-api-key': API_KEY },
                data: { token: mockToken, name: 'test-bot' }
            });
            (0, test_1.expect)(response.status()).toBe(200);
            const body = await response.json();
            (0, test_1.expect)(body).toHaveProperty('botId');
            (0, test_1.expect)(body).toHaveProperty('status', 'registered');
        });
        (0, test_1.test)('should list registered bots via GET /admin/bots', async ({ request }) => {
            const response = await request.get(`${BASE_URL}/admin/bots`, {
                headers: { 'x-api-key': API_KEY }
            });
            (0, test_1.expect)(response.status()).toBe(200);
            const body = await response.json();
            (0, test_1.expect)(Array.isArray(body)).toBe(true);
        });
        (0, test_1.test)('should reject requests without API key', async ({ request }) => {
            const response = await request.post(`${BASE_URL}/admin/bots`, {
                data: { token: 'invalid' }
            });
            (0, test_1.expect)(response.status()).toBe(401);
        });
    });
    test_1.test.describe('WebSocket Gateway', () => {
        (0, test_1.test)('should establish WebSocket connection with token', async ({ page }) => {
            const wsPromise = page.wait_for_websocket(30000);
            const wsUrl = `${BASE_URL.replace('http', 'ws')}?token=${process.env.GATEWAY_API_KEY || 'test-api-key'}`;
            await page.evaluate(`new WebSocket("${wsUrl}")`);
            const websocket = await wsPromise;
            (0, test_1.expect)(websocket.url).toContain('token=');
            (0, test_1.expect)(websocket.readyState).toBe(WebSocket.OPEN);
        });
        (0, test_1.test)('should handle subscribe message', async ({ page }) => {
            const wsUrl = `${BASE_URL.replace('http', 'ws')}?token=${process.env.GATEWAY_API_KEY || 'test-api-key'}`;
            const result = await page.evaluate(async (url) => {
                return new Promise((resolve) => {
                    const ws = new WebSocket(url);
                    ws.onopen = () => {
                        ws.send(JSON.stringify({ type: 'subscribe', botId: '123456:ABC' }));
                    };
                    ws.onmessage = (event) => {
                        resolve(JSON.parse(event.data));
                    };
                });
            }, wsUrl);
            (0, test_1.expect)(result).toHaveProperty('type', 'subscribed');
            (0, test_1.expect)(result).toHaveProperty('botId', '123456:ABC');
        });
    });
    test_1.test.describe('Webhook Endpoint', () => {
        (0, test_1.test)('should receive and process webhook update', async ({ request }) => {
            const mockUpdate = {
                update_id: 123456,
                message: {
                    message_id: 1,
                    from: { id: 123, is_bot: false, first_name: 'Test' },
                    chat: { id: 123, type: 'private' },
                    date: Math.floor(Date.now() / 1000),
                    text: 'Hello'
                }
            };
            const response = await request.post(`${BASE_URL}/webhook/bot/test-bot-id`, {
                data: mockUpdate
            });
            (0, test_1.expect)(response.status()).toBe(200);
        });
    });
});
//# sourceMappingURL=webhook-gateway.test.js.map