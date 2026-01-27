/**
 * Hook for generating stable IDs for a SmartDockview instance.
 *
 * SmartDockview uses two IDs with different purposes:
 * - `scopeHostId`: Internal ID for ContextHubHost scope isolation (prefixed with "dockview:")
 * - `dockviewId`: Public ID for registry, context menu, and cross-dockview communication
 *
 * When `panelManagerId` is provided, IDs are deterministic and consistent across sessions.
 * When not provided, a random ID is generated (suitable for ephemeral docks).
 */

import { useMemo } from 'react';

export interface DockviewIds {
  /**
   * Internal ID for ContextHubHost scope isolation.
   * Format: "dockview:{panelManagerId}" or "dockview:{randomId}"
   */
  scopeHostId: string;

  /**
   * Public ID used for registry, context menu, and cross-dockview communication.
   * Equals `panelManagerId` if provided, otherwise falls back to `scopeHostId`.
   */
  dockviewId: string;
}

/**
 * Generates stable IDs for a SmartDockview instance.
 *
 * @param panelManagerId - Optional user-provided stable identifier (e.g., "controlCenter")
 * @returns Object with scopeHostId and dockviewId
 *
 * @example
 * // With panelManagerId
 * const { scopeHostId, dockviewId } = useDockviewIds("controlCenter");
 * // scopeHostId = "dockview:controlCenter"
 * // dockviewId = "controlCenter"
 *
 * @example
 * // Without panelManagerId (ephemeral dock)
 * const { scopeHostId, dockviewId } = useDockviewIds(undefined);
 * // scopeHostId = "dockview:a1b2c3d" (random)
 * // dockviewId = "dockview:a1b2c3d" (same as scopeHostId)
 */
export function useDockviewIds(panelManagerId: string | undefined): DockviewIds {
  return useMemo(() => {
    const scopeHostId = panelManagerId
      ? `dockview:${panelManagerId}`
      : `dockview:${Math.random().toString(36).slice(2, 9)}`;

    const dockviewId = panelManagerId ?? scopeHostId;

    return { scopeHostId, dockviewId };
  }, [panelManagerId]);
}
