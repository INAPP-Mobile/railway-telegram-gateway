const { execSync } = require('child_process');
execSync('git add e2e/', { cwd: __dirname + '/..', stdio: 'inherit' });
console.log('✅ Staged e2e/');
execSync('git add .cowork/', { cwd: __dirname + '/..', stdio: 'inherit' });
console.log('✅ Staged .cowork/');