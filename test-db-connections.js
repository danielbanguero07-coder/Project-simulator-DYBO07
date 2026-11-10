const { Client } = require('pg');
const Redis = require('ioredis');

async function testConnections() {
  console.log('🔍 Testing connections...\n');

  // Test PostgreSQL
  try {
    const pgClient = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'postgres', // from .env or trust auth
      database: 'simulator'
    });
    await pgClient.connect();
    const res = await pgClient.query('SELECT 1 as status');
    console.log('✅ PostgreSQL connection OK');
    console.log('   Result:', res.rows[0]);
    await pgClient.end();
  } catch (err) {
    console.log('❌ PostgreSQL error:', err.message);
  }

  // Test Redis
  try {
    const redis = new Redis({
      host: 'localhost',
      port: 6379
    });
    await redis.ping();
    console.log('✅ Redis connection OK');
    await redis.quit();
  } catch (err) {
    console.log('❌ Redis error:', err.message);
  }
}

testConnections().catch(console.error);