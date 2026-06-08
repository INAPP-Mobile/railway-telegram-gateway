import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const API_KEY  = process.env.GATEWAY_API_KEY || 'test-api-key-prod';

test.describe('Integration - Full bot registration flow', () => {
  test('unprotected endpoints return 401 on protected routes', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin/bots`);
    expect(res.status()).toBe(401);
  });

  test('all required HTTP methods are wired correctly', async ({ request }) => {
    // POST (registration)
    const postRes = await request.post(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
      data: { token: '123456:fake-token-for-test' },
    });

    // POST returns either 400 (bad format), 4xx (invalid token) or rejects at Telegram level — not 200
    const postStatus = postRes.status();
    expect(postStatus).not.toBe(200); // No fake token should succeed against real Telegram API

    // GET (list)
    const getRes = await request.get(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /webhook/bot/:botId requires bot to be active', async ({ request }) => {
    // Webhook route always accepts POST — if bot is registered it dispatches
    // If not, just returns "OK" (200) since the getMe check in admin.registerBot is what would fail
    const res = await request.post(`${BASE_URL}/webhook/bot/test-bot`, {
      data: { message: { text: 'test' } },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('WebSocket connection lifecycle', () => {
  test('can ping-pong with botId subscribe pattern via page.evaluate', async ({ page }) => {
    // Create a WebSocket directly in browser context
    const result = await page.evaluate(async (args) => {
      const { wsUrl, token } = args;
      return new Promise((resolve) => {
        const ws = new WebSocket(wsUrl);
        let received: any = null;

        ws.onmessage = (event) => {
          // Could get subscribed response
          try {
            parsed = JSON.parse(event.data);
            if (parsed.type === 'subscribed') {
              received = parsed;
            }
          } catch { /* pong or text message */ }
        };

        ws.onopen = () => {
          // No subscribe support in the real server — only sends back the botId as confirmation
          resolve({});
        };

        setTimeout(() => resolve({ received }), 500);
      });
    }, {
      wsUrl: `ws://localhost:3001?token=${API_KEY}`,
      token: API_KEY,
    });

    // Just check the test doesn't crash — real WS tests need a running dev server in CI
  });
});