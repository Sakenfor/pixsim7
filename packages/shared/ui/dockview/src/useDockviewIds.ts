/**
 * Hook for generating stable IDs for a SmartDockview instance.
 *
 * ID semantics:
 * - scopeHostId: internal ID used for ContextHubHost scoping (always prefixed with "dockview:")
 * - dockviewId: public ID used for host registry + context menu cross-dockview lookups
 *
 * When panelManagerId is provided, dockviewId equals it and scopeHostId is "dockview:{panelManagerId}".
 * When omitted, both IDs are generated from a random "dockview:{id}" value.
 */

import { useMemo } from 'react';

export interface DockviewIds {
  /** Internal ContextHubHost scope ID (always prefixed with "dockview:") */
  scopeHostId: string;
  /** Public dockview ID for registry + context menu */
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
