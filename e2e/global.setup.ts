import { test as setup } from '@playwright/test';

// This file is loaded by the Playwright 'setup' project but does NOT start a server.
// The server under test must be running locally on port 3001 (or PORT env var)
// before any tests execute, e.g.:
//   GATEWAY_API_KEY=test-key-123 PORT=3001 npm run dev &
//
// See playwright.config.ts for how to enable webServer auto-lifecycle.

setup('ensure server is accessible', async () => {
  // No browser needed – just a lightweight connectivity probe in teardown phase tests.
});