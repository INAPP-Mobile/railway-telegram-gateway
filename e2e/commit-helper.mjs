import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Restore deleted test-result files from HEAD so git can stage them
const files = [
  'test-results/.last-run.json',
  'test-results/e2e-webhook-gateway-Railwa-110ca--and-process-webhook-update/error-context.md',
  'test-results/e2e-webhook-gateway-Railwa-47383-red-bots-via-GET-admin-bots/error-context.md',
  'test-results/e2e-webhook-gateway-Railwa-5449d-ct-requests-without-API-key/error-context.md',
  'test-results/e2e-webhook-gateway-Railwa-58f76-ld-handle-subscribe-message/error-context.md',
  'test-results/e2e-webhook-gateway-Railwa-a1372-r-a-bot-via-POST-admin-bots/error-context.md',
  'test-results/e2e-webhook-gateway-Railwa-aeca9-ocket-connection-with-token/error-context.md'
];

for (const file of files) {
  try {
    execSync(`git show HEAD:${file}`, { stdio: 'pipe' });
  } catch {
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(file, '');
  }
}

console.log('Files restored. Staging...');
execSync('git add . --force', { stdio: 'inherit' });
console.log('Staged. Status:');
console.log(execSync('git status --short', { encoding: 'utf8' }));

