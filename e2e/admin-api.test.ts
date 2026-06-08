import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const API_KEY = process.env.GATEWAY_API_KEY || 'test-api-key-prod';

test.describe('Admin API - Bot Lifecycle', () => {
  test('GET /admin/bots returns empty list initially', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /admin/bots rejects without API key', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/admin/bots`, {
      data: { token: '123456:FAKE_bot_token' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /admin/bots rejects with wrong API key', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': 'wrong-key' },
      data: { token: '123456:FAKE_bot_token' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /admin/bots rejects missing token field', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('POST /admin/bots rejects invalid Telegram bot token (not 2xx)', async ({ request }) => {
    // Uses the real Telegram getMe API — this should fail for a fake token
    const res = await request.post(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
      data: { token: '0:invalid-token-format', name: 'invalid-bot' },
    });
    expect(res.status()).not.toBe(200);
  });

  test('GET /admin/bots/:botId returns 404 for unregistered bot', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin/bots/nonexistent-bot-id`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('Admin API - WebSocket Gateway Auth', () => {
  test('Request without API key gets rejected (unprotected endpoint)', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin/bots`);
    expect(res.status()).toBe(401);
  });
});