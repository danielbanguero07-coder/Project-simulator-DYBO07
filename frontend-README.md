# Frontend Boilerplate - Simulation Game

## Estado del Backend
- **Base URL**: http://localhost:3000
- **WebSocket**: ws://localhost:3000
- **Auth**: POST /api/v1/auth/login (admin@simulator.com / admin123)
- **Docs**: http://localhost:3000/docs-json

## Estructura a Crear
apps/frontend/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── lib/
    │   ├── api.ts
    │   └── socket.ts
    ├── store/
    │   └── gameStore.ts
    ├── components/
    │   ├── GameCanvas.tsx
    │   ├── HUD.tsx
    │   └── common/
    └── types/

## Iniciar ahora:
1. Crear carpeta apps/frontend
2. npm create vite@latest . -- --template react-ts
3. npm install [dependencies]
4. npm install -D [dev dependencies]
5. npx tailwindcss init -p
6. npm run dev