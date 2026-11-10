const http = require('http');

function checkServer() {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/health',
    method: 'GET',
    timeout: 3000
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log(`✅ Server Status: ${res.statusCode}`);
      console.log('Response:', data);
      process.exit(0);
    });
  });

  req.on('error', (e) => {
    console.log('❌ Server not available:', e.code);
    console.log('Backend needs to be started first');
    process.exit(1);
  });

  req.on('timeout', () => {
    console.log('⏳ Timeout - server may still be starting');
    req.destroy();
  });

  req.end();
}

checkServer();