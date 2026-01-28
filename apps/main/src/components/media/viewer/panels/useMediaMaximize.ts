/**
 * useMediaMaximize Hook
 *
 * Handles maximize/restore logic for media panel using dockview API.
 * Intelligently detects current state by checking actual panel height.
 */

import type { DockviewApi } from 'dockview-core';
import { useCallback, useMemo, type MutableRefObject } from 'react';

import type { DockviewHost } from '@lib/dockview';

interface UseMediaMaximizeOptions {
  dockviewApi?: DockviewApi;
  /** Ref to dockview API - preferred over dockviewApi for stable access */
  dockviewApiRef?: MutableRefObject<DockviewApi | undefined>;
  /** Dockview host wrapper - preferred over dockviewApi for stability */
  dockviewHost?: DockviewHost | null;
  /** Ref to dockview host wrapper */
  dockviewHostRef?: MutableRefObject<DockviewHost | null>;
  maximizedHeight?: number; // Percentage (default: 0.95)
  normalHeight?: number; // Percentage (default: 0.75)
}

export function useMediaMaximize({
  dockviewApi,
  dockviewApiRef,
  dockviewHost,
  dockviewHostRef,
  maximizedHeight = 0.95,
  normalHeight = 0.75,
}: UseMediaMaximizeOptions = {}) {
  // Prefer ref if available, fall back to direct prop
  const getApi = useCallback(
    () => dockviewHostRef?.current?.api ?? dockviewHost?.api ?? dockviewApiRef?.current ?? dockviewApi,
    [dockviewApi, dockviewApiRef, dockviewHost, dockviewHostRef],
  );

  /**
   * Check if the media panel is currently in maximized state
   * by comparing its actual height to the maximized/normal thresholds
   */
  const isMaximized = useMemo(() => {
    const api = getApi();
    if (!api || api.groups.length < 2) return false;

    try {
      const mediaGroup = api.groups[0];
      const currentHeight = mediaGroup.api.height;
      const viewportHeight = window.innerHeight;

      // Calculate target heights
      const maxHeight = viewportHeight * maximizedHeight;
      const normHeight = viewportHeight * normalHeight;

      // Determine which state we're closer to
      // If current height is closer to max than normal, consider it maximized
      const distanceToMax = Math.abs(currentHeight - maxHeight);
      const distanceToNormal = Math.abs(currentHeight - normHeight);

      return distanceToMax < distanceToNormal;
    } catch {
      return false;
    }
  }, [getApi, maximizedHeight, normalHeight]);

  const toggleMaximize = useCallback(() => {
    const api = getApi();
    if (!api) {
      console.warn('[useMediaMaximize] Dockview API not available');
      return;
    }

    try {
      const groups = api.groups;

      if (groups.length >= 2) {
        const viewportHeight = window.innerHeight;
        const mediaGroupId = groups[0].id;
        const mediaGroup = api.getGroup(mediaGroupId);

        if (!mediaGroup) {
          console.warn('[useMediaMaximize] Media group not found');
          return;
        }

        const currentHeight = mediaGroup.api.height;

        // Calculate target heights
        const maxHeight = Math.floor(viewportHeight * maximizedHeight);
        const normHeight = Math.floor(viewportHeight * normalHeight);

        // Determine current state by comparing distances
        const distanceToMax = Math.abs(currentHeight - maxHeight);
        const distanceToNormal = Math.abs(currentHeight - normHeight);
        const currentlyMaximized = distanceToMax < distanceToNormal;

        // Toggle to opposite state
        const newHeight = currentlyMaximized ? normHeight : maxHeight;

        mediaGroup.api.setSize({ height: newHeight });
      } else {
        console.warn('[useMediaMaximize] Expected 2+ groups but found', groups.length);
      }
    } catch (e) {
      console.warn('[useMediaMaximize] Failed to toggle maximize:', e);
    }
  }, [getApi, maximizedHeight, normalHeight]);

  return {
    isMaximized,
    toggleMaximize,
  };
}
