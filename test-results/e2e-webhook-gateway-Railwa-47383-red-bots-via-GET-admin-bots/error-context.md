# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/webhook-gateway.test.ts >> Railway Telegram Gateway >> Admin API - Bot Management >> should list registered bots via GET /admin/bots
- Location: e2e/webhook-gateway.test.ts:24:9

# Error details

```
Error: apiRequestContext.get: connect ECONNREFUSED ::1:3000
Call log:
  - → GET http://localhost:3000/admin/bots
    - user-agent: Playwright/1.60.0 (x64; fedora 44) node/22.22
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - x-api-key: test-api-key

```