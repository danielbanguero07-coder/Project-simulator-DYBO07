const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`✅ Backend Response: ${res.statusCode}`);
    console.log('Body:', data);
  });
});

req.on('error', (e) => {
  console.log(`❌ Error: ${e.message}`);
});

req.on('timeout', () => {
  console.log('⏳ Timeout esperando al backend...');
  req.destroy();
});

req.end();