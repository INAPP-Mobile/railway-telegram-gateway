const { execSync } = require('child_process');
const cwd = __dirname + '/..';

execSync('git add -A', { cwd, stdio: 'inherit' });
execSync('git commit -m "[coder] Remove temp commit script"', { cwd, stdio: 'inherit' });
try {
  execSync('git push --force-with-lease', { cwd, stdio: 'inherit' });
} catch (_) {}