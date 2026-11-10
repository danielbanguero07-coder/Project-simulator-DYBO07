import { createContext, ReactNode, useContext } from 'react';

const WebSocketContext = createContext<Record<string, never> | null>(null);

/**
 * Socket lifecycle is managed by the game store (connect after login).
 * This provider exists so components can opt into socket context later.
 */
export function WebSocketProvider({ children }: { children: ReactNode }) {
  return <WebSocketContext.Provider value={{}}>{children}</WebSocketContext.Provider>;
}

export function useWebSocketContext() {
  return useContext(WebSocketContext);
}
