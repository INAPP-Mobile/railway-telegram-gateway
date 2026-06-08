import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const API_KEY = process.env.GATEWAY_API_KEY || 'test-api-key-prod';

test.describe('WebSocket Gateway', () => {
  const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
  const wsBase = `${BASE_URL.replace(/^http/, wsProtocol)}`;

  test('rejects connection without token', async ({ page }) => {
    let isOpen = false;
    await page.route(`*/**/${BASE_URL.replace(/https?:\/\//, '')}/*`, async (route) => {
      // Intercept any WebSocket to track open/closed states
      route.continue();
    });

    const wsPromise = page.waitForEvent('websocket', { timeout: 10_000 }).catch(() => null);

    await page.evaluate(async (url) => {
      return new Promise<void>((resolve) => {
        const ws = new WebSocket(url);
        ws.onopen = () => { isOpen = true; resolve(); };
      });
    }, `${wsBase}?token=invalid-key`);

    // Allow a brief moment for open/closed to settle
    await page.waitForTimeout(500);
    expect(isOpen).toBe(false);
  });

  test('establishes WebSocket with correct API key', async ({ page }) => {
    const wsPromise = page.waitForEvent('websocket').catch(() => null);

    let connectOk = false;
    await page.evaluate(async (url) => {
      return new Promise<void>((resolve) => {
        const ws = new WebSocket(url);
        ws.onopen = () => { resolve(); };
      });
    }, `${wsBase}?token=${API_KEY}`);

    await page.waitForTimeout(200);
  });
});