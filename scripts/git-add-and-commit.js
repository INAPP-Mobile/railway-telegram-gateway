const { execSync } = require('child_process');
const cwd = __dirname + '/..';
// Add everything including untracked files
execSync('git add -A', { cwd, stdio: 'inherit' });
console.log('✅ Staged all files');
// Check what's staged
execSync('git status --short', { cwd, stdio: 'inherit' });