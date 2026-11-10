import React from 'react';
import { GameProvider, useGame } from './store/gameStore';
import { WebSocketProvider } from './lib/socket';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function GameApp() {
  const { game } = useGame();
  
  return (
    <div className="min-h-screen bg-background text-text font-sans">
      {game.isLogin ? (
        <LoginView />
      ) : (
        <GameView />
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <GameProvider>
          <GameApp />
        </GameProvider>
      </WebSocketProvider>
    </QueryClientProvider>
  );
}

function LoginView() {
  const { login } = useGame();
  
  return (
    <div className="flex items-center justify-center min-h-screen">
      <form onSubmit={(e) => { e.preventDefault(); login(); }} className="space-y-4">
        <input type="text" placeholder="Email" className="input" required />
        <input type="password" placeholder="Password" className="input" required />
        <button type="submit" className="btn btn-primary w-full">Login</button>
      </form>
    </div>
  );
}

function GameView() {
  const { username, resources, buildings } = useGame();
  
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Welcome, {username}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Resource Panel */}
        <div className="bg-surface rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Resources</h2>
          {Object.entries(resources).map(([name, value]) => (
            <div key={name} className="flex justify-between py-1">
              <span className="capitalize">{name}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
        
        {/* Buildings Panel */}
        <div className="bg-surface rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Buildings</h2>
          {buildings.slice(0, 5).map((building) => (
            <div key={building.id} className="bg-background rounded p-2 mb-2">
              <span className="font-medium">{building.templateId}</span>
              <span className="text-muted text-sm"> - {building.level}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}