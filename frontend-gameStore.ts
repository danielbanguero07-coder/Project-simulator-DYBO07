import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';

interface Building {
  id: string;
  templateId: string;
  level: number;
  position: { x: number; y: number };
  status: 'IDLE' | 'PRODUCING' | 'UPGRADING' | 'CONSTRUCTING' | 'DAMAGED' | 'DESTROYED';
  progress: number;
  productionEndAt: Date | null;
  storedResources: Record<string, number>;
}

interface GameState {
  user: { id: string; email: string; username: string } | null;
  username: string;
  game: {
    isLogin: boolean;
    resources: Record<string, number>;
    buildings: Building[];
    tick: number;
  };
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
  login: (email?: string, password?: string) => Promise<void>;
  logout: () => void;
}

export const useGame = create<GameState>()(
  devtools((set, get) => ({
    user: null,
    username: '',
    game: {
      isLogin: false,
      resources: { gold: 0, wood: 0, stone: 0, food: 0 },
      buildings: [],
      tick: 0,
    },
    socket: null,
    
    connect: () => {
      const socket = io('http://localhost:3000', {
        transports: ['websocket'],
        auth: {
          token: localStorage.getItem('accessToken'),
        },
      });
      
      socket.on('connect', () => {
        console.log('Socket connected');
      });
      
      socket.on('state_sync', (state) => {
        set({ game: { ...get().game, ...state } });
      });
      
      socket.on('disconnect', () => {
        console.log('Socket disconnected');
      });
      
      set({ socket });
    },
    
    disconnect: () => {
      const socket = get().socket;
      if (socket) {
        socket.disconnect();
        set({ socket: null });
      }
    },
    
    login: async (email = 'admin@simulator.com', password = 'admin123') => {
      try {
        const response = await axios.post('http://localhost:3000/api/v1/auth/login', {
          email,
          password,
        }, {
          withCredentials: true,
        });
        
        localStorage.setItem('username', response.data.user.username);
        set({ 
          user: response.data.user,
          username: response.data.user.username,
          game: { 
            ...get().game, 
            isLogin: true,
            resources: response.data.user.resources || { gold: 500, wood: 200, stone: 150, food: 100 },
          },
        });
        
        get().connect();
      } catch (error) {
        console.error('Login failed:', error);
      }
    },
    
    logout: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('username');
      get().disconnect();
      set({ 
        user: null, 
        username: '',
        game: { 
          isLogin: false, 
          resources: { gold: 0, wood: 0, stone: 0, food: 0 },
          buildings: [],
          tick: 0,
        },
      });
    },
  }))
);

export const GameProvider = ({ children }: { children: React.ReactNode }) => {
  React.useEffect(() => {
    const username = localStorage.getItem('username');
    if (username) {
      useGame.setState({ username });
    }
  }, []);
  
  return <>{children}</>;
};