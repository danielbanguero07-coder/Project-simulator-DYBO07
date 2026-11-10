// Script para inicializar y compilar el frontend
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = 'D:\\descargas\\Angel\\Project simulator';

function run(cmd) {
  console.log(`▶ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: FRONTEND_DIR });
    return true;
  } catch (e) {
    console.error(`❌ Error ejecutando: ${cmd}`);
    return false;
  }
}

console.log('\\n🔧 Inicializando frontend...\\n');

// Paso 1: Verificar que package.json existe
const pkgPath = path.join(FRONTEND_DIR, 'frontend-package.json');
if (fs.existsSync(pkgPath)) {
  fs.copyFileSync(pkgPath, path.join(FRONTEND_DIR, 'package.json'));
  console.log('✅ package.json listo');
}

// Paso 2: Instalar dependencias
console.log('\\n📦 Instalando dependencias...');
const success = run('npm install --legacy-peer-deps');

if (success) {
  console.log('\\n✅ Dependencias instaladas correctamente');
  
  // Paso 3: Compilar
  console.log('\\n🔨 Compilando frontend...');
  const buildSuccess = run('npm run build');
  
  if (buildSuccess) {
    console.log('\\n🎉 Frontend compilado exitosamente!');
    console.log('📂 Build en: ' + path.join(FRONTEND_DIR, 'dist'));
    process.exit(0);
  }
}

process.exit(1);