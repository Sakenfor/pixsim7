/**
 * Dockview ID Context
 *
 * Simple context to provide the current dockview's ID to child components.
 * Used by CustomTabComponent to know which dockview triggered the context menu.
 */

import { createContext, useContext, type ReactNode } from 'react';

const DockviewIdContext = createContext<string | undefined>(undefined);

interface DockviewIdProviderProps {
  children: ReactNode;
  dockviewId: string | undefined;
}

export function DockviewIdProvider({ children, dockviewId }: DockviewIdProviderProps) {
  return (
    <DockviewIdContext.Provider value={dockviewId}>
      {children}
    </DockviewIdContext.Provider>
  );
}

export function useDockviewId(): string | undefined {
  return useContext(DockviewIdContext);
}
