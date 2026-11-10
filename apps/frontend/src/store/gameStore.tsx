import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import type { ReactNode } from 'react';

export interface Building {
  id: string;
  templateId: string;
  level: number;
  position: { x: number; y: number };
  status: 'IDLE' | 'PRODUCING' | 'UPGRADING' | 'CONSTRUCTING' | 'DAMAGED' | 'DESTROYED';
  progress: number;
  productionEndAt: Date | null;
  storedResources: Record<string, number>;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  roles?: string[];
}

interface GameState {
  user: AuthUser | null;
  username: string;
  loading: boolean;
  error: string | null;
  connected: boolean;
  isLogin: boolean;
  game: {
    resources: Record<string, number>;
    buildings: Building[];
    tick: number;
  };
  socket: Socket | null;
  connect: () => void;
  loadGameState: () => Promise<void>;
  disconnect: () => void;
  login: (email?: string, password?: string) => Promise<void>;
  logout: () => void;
  placeBuilding: (x: number, y: number, templateId: string) => void;
}

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';
const DEFAULT_WORLD_ID = 'world-main';

type ResourceInput =
  | Record<string, number>
  | Array<{ type: string; amount: number }>
  | null
  | undefined;

/** The API returns resources either as a map or as an array of { type, amount }. */
function normalizeResources(
  input: ResourceInput,
  fallback: Record<string, number>,
): Record<string, number> {
  if (!input) return fallback;
  if (Array.isArray(input)) {
    return input.reduce<Record<string, number>>(
      (acc, resource) => ({ ...acc, [resource.type]: Number(resource.amount) }),
      { ...fallback },
    );
  }
  return { ...fallback, ...input };
}

export const useGame = create<GameState>()(
  devtools((set, get) => ({
    user: null,
    username: '',
    loading: false,
    error: null,
    connected: false,
    isLogin: false,
    game: {
      resources: { gold: 0, wood: 0, stone: 0, food: 0 },
      buildings: [],
      tick: 0,
    },
    socket: null,

    connect: () => {
      const existing = get().socket;
      if (existing?.connected) return;

      const token = localStorage.getItem('accessToken');
      const socket = io(API_URL, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        auth: { token },
      });

      socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        set({ connected: true });
        // Enter the world so the server tracks this player session.
        socket.emit('join_world', { worldId: DEFAULT_WORLD_ID });
      });
      socket.on('connect_error', (err) => {
        console.warn('Socket connection error:', err.message);
        set({ connected: false });
      });
      socket.on('welcome', (payload) => console.log('Welcome:', payload));

      socket.on('state_delta', (delta) => {
        set((state) => ({
          game: {
            ...state.game,
            tick: delta?.tick ?? state.game.tick,
            buildings: delta?.buildings ?? state.game.buildings,
            resources: normalizeResources(delta?.resources, state.game.resources),
          },
        }));
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
        set({ connected: false });
      });
      set({ socket });
    },

    disconnect: () => {
      const socket = get().socket;
      if (socket) {
        socket.disconnect();
        set({ socket: null, connected: false });
      }
    },

    loadGameState: async () => {
      const token = localStorage.getItem('accessToken');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      try {
        await axios.post(
          `${API_URL}/api/v1/simulation/world/${DEFAULT_WORLD_ID}/join`,
          {},
          { withCredentials: true, headers },
        );

        const [worldResponse, profileResponse] = await Promise.all([
          axios.get(`${API_URL}/api/v1/simulation/world/${DEFAULT_WORLD_ID}`, {
            withCredentials: true,
            headers,
          }),
          axios.get(`${API_URL}/api/v1/player/profile`, {
            withCredentials: true,
            headers,
          }),
        ]);

        const world = worldResponse.data?.data ?? worldResponse.data;
        const profile = profileResponse.data?.data ?? profileResponse.data;

        set((state) => ({
          game: {
            ...state.game,
            tick: Number(world?.tick ?? state.game.tick),
            buildings: world?.buildings ?? state.game.buildings,
            resources: normalizeResources(world?.resources, {
              ...state.game.resources,
              gold: Number(profile?.gold ?? state.game.resources.gold),
            }),
          },
        }));
      } catch (error: any) {
        console.warn('Could not load initial game state:', error?.message);
      }
    },

    login: async (email = 'admin@simulator.com', password = 'admin123') => {
      set({ loading: true, error: null });
      try {
        const response = await axios.post(
          `${API_URL}/api/v1/auth/login`,
          { email, password },
          { withCredentials: true },
        );

        // The backend wraps every response as { success, data, meta }.
        const auth = response.data?.data ?? response.data;
        const user: AuthUser = auth.user;

        localStorage.setItem('accessToken', auth.accessToken);
        localStorage.setItem('username', user.username);

        set({
          user,
          username: user.username,
          isLogin: true,
        });

        get().connect();
        void get().loadGameState();
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message ||
          error?.response?.data?.message ||
          'No se pudo iniciar sesión';
        set({ error: message });
        throw new Error(message);
      } finally {
        set({ loading: false });
      }
    },

    logout: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('username');
      get().disconnect();
      set({
        user: null,
        username: '',
        error: null,
        isLogin: false,
        game: {
          resources: { gold: 0, wood: 0, stone: 0, food: 0 },
          buildings: [],
          tick: 0,
        },
      });
    },

    placeBuilding: (x: number, y: number, templateId: string) => {
      const { socket, game } = get();
      if (!socket?.connected) {
        console.warn('Cannot place building: socket not connected');
        return;
      }

      // The gateway expects the generic `action` event shaped like
      // ActionPayloadDto ({ actionId, type, clientTick, data }).
      socket.emit('action', {
        actionId: `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'BUILD',
        clientTick: game.tick,
        data: {
          buildingId: templateId,
          position: { x, y },
        },
      });
    },
  })),
);

export function GameProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Dev-only hook so the state can be inspected from the browser console.
if ((import.meta as any).env?.DEV) {
  (window as any).__gameStore = useGame;
}
