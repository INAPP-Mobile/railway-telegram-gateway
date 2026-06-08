import { test, expect } from '@playwright/test';

// Base URL for local dev server — defaults to port 3000
const BASE_URL = 'http://localhost:3000';
const API_KEY  = process.env.GATEWAY_API_KEY || 'test-api-key-prod';

test.describe('Admin API - Protected routes', () => {
  test('GET /admin/bots returns array [200] with valid key', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.status()).toEqual(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('GET /admin/bots returns [401] without key', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin/bots`);
    expect(res.status()).toEqual(401);
  });

  test('POST /admin/bots requires valid telegram token (getMe check)', async ({ request }) => {
    // fake tokens are rejected by real Telegram getMe endpoint
    const res = await request.post(`${BASE_URL}/admin/bots`, {
      headers: { 'x-api-key': API_KEY },
      data: { token: '0:invalid', name: 'no-op' },
    });
    expect(res.status()).not.toEqual(200);
  });

  test('GET /admin/bots/:botId [404] on unregistered bot', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/admin/bots/fake-123`, {
      headers: { 'x-api-key': API_KEY },
    });
    expect(res.status()).toEqual(404);
  });
});

test.describe('Webhook route', () => {
  test('POST /webhook/bot/:botId [404] on unregistered bot', async ({ request }) => {
    const payload = { update_id: 1, message: { text: 'hello' } };
    const res = await request.post(`${BASE_URL}/webhook/bot/unregistered`, {
      data: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toEqual(404);
  });
});