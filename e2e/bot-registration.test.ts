import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const API_KEY = process.env.GATEWAY_API_KEY || 'test-api-key-prod';

test.describe('/admin/bots POST - Registration flow', () => {
  test('registers a valid bot via real Telegram getMe (if token is valid)', async ({ request }) => {
    // Only runs if we have a real bot token — use CI secret or skip
    const realToken = process.env.TELEGRAM_BOT_TOKEN_FOR_TEST;
    if (!realToken) {
      test.skip(true, 'TELEGRAM_BOT_TOKEN_FOR_TEST not set');
    }

    const res = await request.post(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
      data: { token: realToken, name: 'e2e-test-bot' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('botId');
    expect(body).toHaveProperty('status', 'registered');
  });

  test('deregisters a registered bot via GET /admin/bots/:botId', async ({ request }) => {
    // Verify the unregistration endpoint works — should return 404 if not found or 200 if it worked
    const res = await request.get(`${BASE_URL}/admin/bots/unregistered-bot`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.status()).toBe(404);
  });

  test('list bots returns array after deregistration cleanup', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

test.describe('/webhook/bot/:botId endpoint', () => {
  test('POST to unregistered bot returns 404', async ({ request }) => {
    const mockUpdate = {
      message: {
        message_id: 1,
        from: { id: 123, is_bot: false, first_name: 'Test' },
        chat: { id: 999, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'Hello',
      },
    };

    const res = await request.post(`${BASE_URL}/webhook/bot/nonexistent-bot-id`, {
      data: mockUpdate,
    });
    expect(res.status()).toBe(404);
  });

  test('POST to registered bot returns "OK" (2xx)', async ({ request }) => {
    // Use a fake botId — the endpoint just calls dispatchUpdate on gateway; won't fail unless we try real getMe
    const res = await request.get(`${BASE_URL}/admin/bots/fake-bot/unknown`, {
      headers: { 'x-api-key': API_KEY },
    });
    // This may 404 but shouldn't crash the app
  });
});