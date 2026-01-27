/**
 * Hook for generating stable IDs for a SmartDockview instance.
 */

import { useMemo } from 'react';

export interface DockviewIds {
  scopeHostId: string;
  dockviewId: string;
}

export function useDockviewIds(panelManagerId: string | undefined): DockviewIds {
  return useMemo(() => {
    const scopeHostId = panelManagerId
      ? `dockview:${panelManagerId}`
      : `dockview:${Math.random().toString(36).slice(2, 9)}`;

    const dockviewId = panelManagerId ?? scopeHostId;

    return { scopeHostId, dockviewId };
  }, [panelManagerId]);
}
