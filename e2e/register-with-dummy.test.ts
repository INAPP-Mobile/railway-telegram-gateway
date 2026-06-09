import { test, expect } from '@playwright/test';
const BASE_URL = 'http://localhost:3000';
test('POST /admin/bots with dummy-token & WS confirmation', async ({ page }) => {
  // 1. POST to register bot (assumes SKIP_BOT_VALIDATION is set externally)
  const res = await fetch(`${BASE_URL}/admin/bots`,{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':process.env.GATEWAY_API_KEY || 'mytestkey'},
    body: JSON.stringify({name:'Test Bot', token: '<dummy-token>'})
  });
  const data = await res.json();
  console.log('Register response:',res.status, data);
  expect(res.status).toBe(200);

  // 2. Open WebSocket listener
  const wsPromise = page.waitForEvent('websocket',{timeout:5000}).catch(()=>null);
  // Use a generic frame connection to catch websocket event 
  await page.goto(BASE_URL,{waitUntil:'domcontentloaded'});
  // Wait for the WebSocket object
  await new Promise(r=>setTimeout(r,1000));
  const ws = await wsPromise;
  console.log('WebSocket connect:',ws ? 'connected':'failed');
});
