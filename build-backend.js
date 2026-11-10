const { execSync } = require('child_process');

console.log('🔄 Building backend...');

try {
  // First, ensure .prisma/client exists
  execSync('npx prisma generate', { 
    cwd: 'D:\\descargas\\Angel\\Project simulator\\backend',
    stdio: 'inherit'
  });
  
  // Then build with nest
  execSync('npx nest build', { 
    cwd: 'D:\\descargas\\Angel\\Project simulator\\backend',
    stdio: 'inherit'
  });
  
  console.log('✅ Build completed successfully!');
} catch (e) {
  console.error('❌ Build failed:', e.message);
}