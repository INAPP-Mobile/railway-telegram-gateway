# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/register-with-dummy.test.ts >> POST /admin/bots with dummy-token & WS confirmation
- Location: e2e/register-with-dummy.test.ts:3:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 500
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | const BASE_URL = 'http://localhost:3000';
  3  | test('POST /admin/bots with dummy-token & WS confirmation', async ({ page }) => {
  4  |   // 1. POST to register bot (assumes SKIP_BOT_VALIDATION is set externally)
  5  |   const res = await fetch(`${BASE_URL}/admin/bots`,{
  6  |     method:'POST',
  7  |     headers:{'Content-Type':'application/json','x-api-key':process.env.GATEWAY_API_KEY || 'mytestkey'},
  8  |     body: JSON.stringify({name:'Test Bot', token: '<dummy-token>'})
  9  |   });
  10 |   const data = await res.json();
  11 |   console.log('Register response:',res.status, data);
> 12 |   expect(res.status).toBe(200);
     |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  13 | 
  14 |   // 2. Open WebSocket listener
  15 |   const wsPromise = page.waitForEvent('websocket',{timeout:5000}).catch(()=>null);
  16 |   // Use a generic frame connection to catch websocket event 
  17 |   await page.goto(BASE_URL,{waitUntil:'domcontentloaded'});
  18 |   // Wait for the WebSocket object
  19 |   await new Promise(r=>setTimeout(r,1000));
  20 |   const ws = await wsPromise;
  21 |   console.log('WebSocket connect:',ws ? 'connected':'failed');
  22 | });
  23 | 
```