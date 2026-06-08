const { execSync } = require('child_process');
const cwd = __dirname + '/..';

execSync('git add -A', { cwd, stdio: 'inherit' });
execSync('git commit -m "[coder] Enforce required GATEWAY_API_KEY at startup — fail fast with process.exit(1)"', { cwd, stdio: 'inherit' });
try {
  execSync('git push --force-with-lease', { cwd, stdio: 'inherit' });
  console.log('✅ Pushed');
} catch (e) {
  console.log('⚠️ Push failed:', e.message);
}