/* eslint-disable react-refresh/only-export-components */
/**
 * Dockview ID Context
 *
 * Simple context to provide the current dockview's ID to child components.
 * Used by CustomTabComponent to know which dockview triggered the context menu.
 */

import type { DockviewApi } from 'dockview-core';
import { useContext, useMemo, type ReactNode } from 'react';

import { createHmrSafeContext } from '@lib/utils';

import type { PanelRegistryLike } from './types';

type DockviewContextValue = {
  dockviewId?: string;
  panelRegistry?: PanelRegistryLike;
  dockviewApi?: DockviewApi;
  floatPanelHandler?: (dockviewPanelId: string, panel: any, options?: any) => void;
  scopedPanelIds?: string[];
};

const DockviewIdContext = createHmrSafeContext<DockviewContextValue>('dockviewId', {});

interface DockviewIdProviderProps {
  children: ReactNode;
  dockviewId: string | undefined;
  panelRegistry?: PanelRegistryLike;
  dockviewApi?: DockviewApi | null;
  floatPanelHandler?: (dockviewPanelId: string, panel: any, options?: any) => void;
  scopedPanelIds?: string[];
}

export function DockviewIdProvider({
  children,
  dockviewId,
  panelRegistry,
  dockviewApi,
  floatPanelHandler,
  scopedPanelIds,
}: DockviewIdProviderProps) {
  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo(
    () => ({
      dockviewId,
      panelRegistry,
      dockviewApi: dockviewApi ?? undefined,
      floatPanelHandler,
      scopedPanelIds,
    }),
    [dockviewId, panelRegistry, dockviewApi, floatPanelHandler, scopedPanelIds]
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
