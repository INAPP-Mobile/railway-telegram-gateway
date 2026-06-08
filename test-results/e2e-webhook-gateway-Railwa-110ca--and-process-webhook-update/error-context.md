# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/webhook-gateway.test.js >> Railway Telegram Gateway >> Webhook Endpoint >> should receive and process webhook update
- Location: e2e/webhook-gateway.test.ts:77:9

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED ::1:3000
Call log:
  - → POST http://localhost:3000/webhook/bot/test-bot-id
    - user-agent: Playwright/1.60.0 (x64; fedora 44) node/22.22
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 168

```