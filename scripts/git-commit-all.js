const { execSync } = require('child_process');
const cwd = __dirname + '/..';

// Add everything including untracked files
execSync('git add -A', { cwd, stdio: 'inherit' });
console.log('✅ Staged all files');

// Commit
execSync('git commit -m "[coder] Add e2e tests and project config"', { cwd, stdio: 'inherit' });
console.log('✅ Committed');

// Push (may fail if no remote — that's OK)
try {
  execSync('git push --force-with-lease', { cwd, stdio: 'inherit' });
  console.log('✅ Pushed');
} catch (e) {
  console.log('⚠️ Push failed (expected if no remote configured):', e.message);
}