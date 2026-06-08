import { test, expect } from '@playwright/test';

const TEST_PORT = process.env.PORT || '3000';
const BASE_URL = `http://localhost:${TEST_PORT}`;

test.describe('Railway Telegram Gateway', () => {
  test.describe('Admin API - Bot Management', () => {
    const API_KEY = process.env.GATEWAY_API_KEY || 'test-api-key';

    test('should register a bot via POST /admin/bots', async ({ request }) => {
      const mockToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
      
      const response = await request.post(`${BASE_URL}/admin/bots`, {
        headers: { 'x-api-key': API_KEY },
        data: { token: mockToken, name: 'test-bot' }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('botId');
      expect(body).toHaveProperty('status', 'registered');
    });

    test('should list registered bots via GET /admin/bots', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/admin/bots`, {
        headers: { 'x-api-key': API_KEY }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
    });

    test('should reject requests without API key', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/admin/bots`, {
        data: { token: 'invalid' }
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('WebSocket Gateway', () => {
    test('should establish WebSocket connection with token', async ({ page }) => {
      const wsPromise = page.wait_for_websocket(30000);
      
      const wsUrl = `${BASE_URL.replace('http', 'ws')}?token=${process.env.GATEWAY_API_KEY || 'test-api-key'}`;
      await page.evaluate(`new WebSocket("${wsUrl}")`);
      
      const websocket = await wsPromise;
      expect(websocket.url).toContain('token=');
      expect(websocket.readyState).toBe(WebSocket.OPEN);
    });

    test('should handle subscribe message', async ({ page }) => {
      // This test assumes backend is running
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

      expect(result).toHaveProperty('type', 'subscribed');
      expect(result).toHaveProperty('botId', '123456:ABC');
    });
  });

  test.describe('Webhook Endpoint', () => {
    test('should receive and process webhook update', async ({ request }) => {
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

      expect(response.status()).toBe(200);
    });
  });
});

// Extend page with wait_for_websocket helper
declare module '@playwright/test' {
  interface Page {
    wait_for_websocket(timeout?: number): Promise<WebSocket>;
  }
}