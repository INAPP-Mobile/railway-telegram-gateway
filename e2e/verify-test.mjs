import { execSync } from 'child_process';

// 1. Verify server is listening
const port = process.env.PORT || 3000;
console.log(`Checking if dev server is running on port ${port}...`);
try {
  // Use axios/fetch via node built-in  
  const fetchResult = await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(2000) });
  console.log('Health check status:', fetchResult.status);
} catch {
  console.log('Dev server not reachable yet — waiting...');
  
  // Wait a bit for it to start
  execSync(`sleep 3`);
  
  try {
    const fetchResult = await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(2000) });
    console.log('Health check status:', fetchResult.status);
  } catch {
    throw new Error('Dev server still not responding');
  }
}

// 2. POST to register bot
console.log('\n--- Test: POST /admin/bots ---');
try {
  const res = await fetch('http://localhost:3000/admin/bots', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'x-api-key': process.env.GATEWAY_API_KEY || 'mytestkey'
    },
    body: JSON.stringify({ name: 'Test Bot', token: '<dummy-token>' })
  });
  
  let data;
  try {
    data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (res.status === 200) {
      console.log('✅ SUCCESS - Bot registered!');
    } else {
      console.log('❌ FAILED - Expected status 200, got', res.status);
    }
  } catch {
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log('Response:', text);
    throw new Error('Could not parse response');
  }
} catch (e) {
  console.error('POST /admin/bots failed:', e.message);
  process.exit(1);
}

// 3. Check WebSocket
console.log('\n--- Test: WS connection to ws://localhost:3000/ ---');
try {
  const WebSocket = await import('ws');
  
  // Connect with token auth
  const tokens = (process.env.GATEWAY_API_KEY || 'mytestkey').split(',');
  let connected = false;
  let events = [];

  for (const token of tokens) {
    try {
      const ws = new WebSocket.default(`ws://localhost:3000?token=${token.trim()}`);
      
      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          connected = true;
          console.log('✅ WebSocket connected successfully');
          resolve();
        });
        
        ws.on('message', (msg) => {
          events.push(msg.toString());
          console.log('Received:', msg.toString());
        });
        
        ws.on('error', reject);
        ws.on('close', () => {
          if (!connected) reject(new Error('WebSocket close before open'));
        });
        
        setTimeout(resolve, 3000); // Wait 3s for event
      });

      console.log('\nEvents received:', events.length);
      
      ws.close();
    } catch (e) {
      console.error(`WS token test failed: ${e.message}`);
    }
  }

} catch (e) {
  console.error('WebSocket test failed:', e.message);
}

console.log('\n--- Done ---');

