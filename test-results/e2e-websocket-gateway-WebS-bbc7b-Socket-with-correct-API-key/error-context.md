# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/websocket-gateway.test.ts >> WebSocket Gateway >> establishes WebSocket with correct API key
- Location: e2e/websocket-gateway.test.ts:31:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.evaluate: Test timeout of 30000ms exceeded.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
  4  | const API_KEY = process.env.GATEWAY_API_KEY || 'test-api-key-prod';
  5  | 
  6  | test.describe('WebSocket Gateway', () => {
  7  |   const wsProtocol = BASE_URL.startsWith('https') ? 'wss' : 'ws';
  8  |   const wsBase = `${BASE_URL.replace(/^http/, wsProtocol)}`;
  9  | 
  10 |   test('rejects connection without token', async ({ page }) => {
  11 |     let isOpen = false;
  12 |     await page.route(`*/**/${BASE_URL.replace(/https?:\/\//, '')}/*`, async (route) => {
  13 |       // Intercept any WebSocket to track open/closed states
  14 |       route.continue();
  15 |     });
  16 | 
  17 |     const wsPromise = page.waitForEvent('websocket', { timeout: 10_000 }).catch(() => null);
  18 | 
  19 |     await page.evaluate(async (url) => {
  20 |       return new Promise<void>((resolve) => {
  21 |         const ws = new WebSocket(url);
  22 |         ws.onopen = () => { isOpen = true; resolve(); };
  23 |       });
  24 |     }, `${wsBase}?token=invalid-key`);
  25 | 
  26 |     // Allow a brief moment for open/closed to settle
  27 |     await page.waitForTimeout(500);
  28 |     expect(isOpen).toBe(false);
  29 |   });
  30 | 
  31 |   test('establishes WebSocket with correct API key', async ({ page }) => {
  32 |     const wsPromise = page.waitForEvent('websocket').catch(() => null);
  33 | 
  34 |     let connectOk = false;
> 35 |     await page.evaluate(async (url) => {
     |                ^ Error: page.evaluate: Test timeout of 30000ms exceeded.
  36 |       return new Promise<void>((resolve) => {
  37 |         const ws = new WebSocket(url);
  38 |         ws.onopen = () => { resolve(); };
  39 |       });
  40 |     }, `${wsBase}?token=${API_KEY}`);
  41 | 
  42 |     await page.waitForTimeout(200);
  43 |   });
  44 | });
```