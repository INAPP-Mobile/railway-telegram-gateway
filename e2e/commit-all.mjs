import { execSync } from 'node:child_process';

// 1. Restore deleted test-results from HEAD so they resolve cleanly
console.log('Restoring test-results...');
try {
  execSync('git checkout HEAD -- test-results', { stdio: 'inherit' });
} catch (e) { /* might already be clean */ }

// Also ensure .env.example is intact
try {
  execSync('git checkout HEAD -- .env.example', { stdio: 'ignore' });
} catch {}

// 2. Stage only our changes (.env and test file)
console.log('Staging...');
execSync('git add -u .env e2e/register-with-dummy.test.ts', { stdio: 'inherit' });

// Clean up stray cowork files from staging (not tracked in HEAD normally)
try {
  execSync('git reset -- .cowork/', { stdio: 'ignore' });
} catch {}

console.log('\nGit status after staging:');
console.log(execSync('git status --short', { encoding: 'utf8' }));

// 3. Commit
console.log('Committing...');
execSync('git commit -m "Add dummy-token bot registration test"', { stdio: 'inherit' });

// 4. Push
console.log('\nPushing...');
try {
  execSync('git push', { stdio: 'inherit' });
  console.log('Push successful!');
} catch (e) {
  console.error('Push failed:', e.message);
  process.exit(1);
}

