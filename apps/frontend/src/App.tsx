import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GameProvider, useGame } from './store/gameStore';
import { WebSocketProvider } from './lib/socket';
import { MainMenu } from '@/components/MainMenu';
import { AirportGameView } from '@/components/AirportGameView';

const queryClient = new QueryClient();

// Flight Simulator entry point
// If user is logged in, show MainMenu first, then transition to game on "Start Flight"
// If not logged in, show login view
export default function App() {
  const { isLogin } = useGame();
  const [showFlight, setShowFlight] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <GameProvider>
          {!isLogin ? (
            <LoginView />
          ) : !showFlight ? (
            <MainMenu onStartFlight={() => setShowFlight(true)} />
          ) : (
            <AirportGameView onMenuBack={() => setShowFlight(false)} />
          )}
        </GameProvider>
      </WebSocketProvider>
    </QueryClientProvider>
  );
}

function LoginView() {
  const { login, loading, error } = useGame();
  const [email, setEmail] = useState('admin@simulator.com');
  const [password, setPassword] = useState('admin123');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await login(email, password);
    } catch {
      /* error is already exposed by the store */
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 bg-slate-950 text-white font-mono">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-slate-900 p-6 shadow-xl">
        <h1 className="text-2xl font-bold">Simulador de Vuelo A320 3D</h1>
        <p className="text-sm text-slate-400">Conexión al backend: localhost:3000</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Email</label>
            <input
              type="email"
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-amber-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white shadow-lg transition hover:bg-sky-500 disabled:opacity-50"
          >
            {loading ? 'Connecting...' : 'Iniciar sesión'}
          </button>

          <p className="text-center text-xs text-slate-400">
            Prueba: admin@simulator.com / admin123
          </p>
        </form>
      </div>
    </div>
  );
}