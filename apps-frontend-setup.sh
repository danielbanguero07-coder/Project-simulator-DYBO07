#!/bin/bash

# Frontend Setup Script
# Ejecutar una vez que los permisos estén resueltos

echo "🚀 Inicializando Frontend..."

# Navegar al workspace
cd "$(dirname "$0")"

# Crear estructura frontend si no existe
mkdir -p apps/frontend/src/{components,lib,store,assets,hooks,types}
mkdir -p apps/frontend/public

# Mover archivos creados
mv frontend-package.json apps/frontend/package.json 2>/dev/null || echo "package.json ya existe"
mv frontend-vite.config.ts apps/frontend/vite.config.ts
mv frontend-tailwind.config.ts apps/frontend/tailwind.config.ts
mv frontend-main.tsx apps/frontend/src/main.tsx
mv frontend-App.tsx apps/frontend/src/App.tsx
mv frontend-gameStore.ts apps/frontend/src/store/gameStore.ts
mv frontend-index.html apps/frontend/index.html

# Crear postcss.config.ts
cat > apps/frontend/postcss.config.js << 'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

# Crear tsconfig.json minimal
cat > apps/frontend/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@lib/*": ["src/lib/*"],
      "@store/*": ["src/store/*"],
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

# Crear tsconfig.node.json
cat > apps/frontend/tsconfig.node.json << 'EOF'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "exclude": ["jest.config.ts", "vite.config.ts"]
}
EOF

echo "✅ Frontend init script ready"
echo "📋 Next steps:"
echo "  cd apps/frontend"
echo "  npm install"
echo "  npm run dev"