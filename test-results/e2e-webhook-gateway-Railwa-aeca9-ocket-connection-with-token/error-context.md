# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/webhook-gateway.test.ts >> Railway Telegram Gateway >> WebSocket Gateway >> should establish WebSocket connection with token
- Location: e2e/webhook-gateway.test.ts:44:9

# Error details

```
TypeError: page.wait_for_websocket is not a function
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const TEST_PORT = process.env.PORT || '3000';
  4   | const BASE_URL = `http://localhost:${TEST_PORT}`;
  5   | 
  6   | test.describe('Railway Telegram Gateway', () => {
  7   |   test.describe('Admin API - Bot Management', () => {
  8   |     const API_KEY = process.env.GATEWAY_API_KEY || 'test-api-key';
  9   | 
  10  |     test('should register a bot via POST /admin/bots', async ({ request }) => {
  11  |       const mockToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  12  |       
  13  |       const response = await request.post(`${BASE_URL}/admin/bots`, {
  14  |         headers: { 'x-api-key': API_KEY },
  15  |         data: { token: mockToken, name: 'test-bot' }
  16  |       });
  17  | 
  18  |       expect(response.status()).toBe(200);
  19  |       const body = await response.json();
  20  |       expect(body).toHaveProperty('botId');
  21  |       expect(body).toHaveProperty('status', 'registered');
  22  |     });
  23  | 
  24  |     test('should list registered bots via GET /admin/bots', async ({ request }) => {
  25  |       const response = await request.get(`${BASE_URL}/admin/bots`, {
  26  |         headers: { 'x-api-key': API_KEY }
  27  |       });
  28  | 
  29  |       expect(response.status()).toBe(200);
  30  |       const body = await response.json();
  31  |       expect(Array.isArray(body)).toBe(true);
  32  |     });
  33  | 
  34  |     test('should reject requests without API key', async ({ request }) => {
  35  |       const response = await request.post(`${BASE_URL}/admin/bots`, {
  36  |         data: { token: 'invalid' }
  37  |       });
  38  | 
  39  |       expect(response.status()).toBe(401);
  40  |     });
  41  |   });
  42  | 
  43  |   test.describe('WebSocket Gateway', () => {
  44  |     test('should establish WebSocket connection with token', async ({ page }) => {
> 45  |       const wsPromise = page.wait_for_websocket(30000);
      |                              ^ TypeError: page.wait_for_websocket is not a function
  46  |       
  47  |       const wsUrl = `${BASE_URL.replace('http', 'ws')}?token=${process.env.GATEWAY_API_KEY || 'test-api-key'}`;
  48  |       await page.evaluate(`new WebSocket("${wsUrl}")`);
  49  |       
  50  |       const websocket = await wsPromise;
  51  |       expect(websocket.url).toContain('token=');
  52  |       expect(websocket.readyState).toBe(WebSocket.OPEN);
  53  |     });
  54  | 
  55  |     test('should handle subscribe message', async ({ page }) => {
  56  |       // This test assumes backend is running
  57  |       const wsUrl = `${BASE_URL.replace('http', 'ws')}?token=${process.env.GATEWAY_API_KEY || 'test-api-key'}`;
  58  |       
  59  |       const result = await page.evaluate(async (url) => {
  60  |         return new Promise((resolve) => {
  61  |           const ws = new WebSocket(url);
  62  |           ws.onopen = () => {
  63  |             ws.send(JSON.stringify({ type: 'subscribe', botId: '123456:ABC' }));
  64  |           };
  65  |           ws.onmessage = (event) => {
  66  |             resolve(JSON.parse(event.data));
  67  |           };
  68  |         });
  69  |       }, wsUrl);
  70  | 
  71  |       expect(result).toHaveProperty('type', 'subscribed');
  72  |       expect(result).toHaveProperty('botId', '123456:ABC');
  73  |     });
  74  |   });
  75  | 
  76  |   test.describe('Webhook Endpoint', () => {
  77  |     test('should receive and process webhook update', async ({ request }) => {
  78  |       const mockUpdate = {
  79  |         update_id: 123456,
  80  |         message: {
  81  |           message_id: 1,
  82  |           from: { id: 123, is_bot: false, first_name: 'Test' },
  83  |           chat: { id: 123, type: 'private' },
  84  |           date: Math.floor(Date.now() / 1000),
  85  |           text: 'Hello'
  86  |         }
  87  |       };
  88  | 
  89  |       const response = await request.post(`${BASE_URL}/webhook/bot/test-bot-id`, {
  90  |         data: mockUpdate
  91  |       });
  92  | 
  93  |       expect(response.status()).toBe(200);
  94  |     });
  95  |   });
  96  | });
  97  | 
  98  | // Extend page with wait_for_websocket helper
  99  | declare module '@playwright/test' {
  100 |   interface Page {
  101 |     wait_for_websocket(timeout?: number): Promise<WebSocket>;
  102 |   }
  103 | }
```