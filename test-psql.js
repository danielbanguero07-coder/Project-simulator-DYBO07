import { execSync } from 'child_process';

try {
  const result = execSync(
    '"C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe" -U postgres -d simulator -c "SELECT 1 as test;"',
    { encoding: 'utf8', stdio: 'pipe' }
  );
  console.log('✅ PostgreSQL connection OK:');
  console.log(result);
} catch (e) {
  console.error('❌ PostgreSQL connection failed:', e.message);
}