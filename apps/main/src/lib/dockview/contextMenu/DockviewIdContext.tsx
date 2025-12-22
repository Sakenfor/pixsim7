/**
 * Dockview ID Context
 *
 * Simple context to provide the current dockview's ID to child components.
 * Used by CustomTabComponent to know which dockview triggered the context menu.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DockviewApi } from 'dockview-core';
import type { PanelRegistryLike } from './types';

type DockviewContextValue = {
  dockviewId?: string;
  panelRegistry?: PanelRegistryLike;
  dockviewApi?: DockviewApi;
};

const DockviewIdContext = createContext<DockviewContextValue>({});

interface DockviewIdProviderProps {
  children: ReactNode;
  dockviewId: string | undefined;
  panelRegistry?: PanelRegistryLike;
  dockviewApi?: DockviewApi | null;
}

export function DockviewIdProvider({
  children,
  dockviewId,
  panelRegistry,
  dockviewApi,
}: DockviewIdProviderProps) {
  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(
    () => ({ dockviewId, panelRegistry, dockviewApi: dockviewApi ?? undefined }),
    [dockviewId, panelRegistry, dockviewApi]
  );

  return (
    <DockviewIdContext.Provider value={value}>
      {children}
    </DockviewIdContext.Provider>
  );
}

export function useDockviewId(): string | undefined {
  return useContext(DockviewIdContext).dockviewId;
}

export function useDockviewContext(): DockviewContextValue {
  return useContext(DockviewIdContext);
}
