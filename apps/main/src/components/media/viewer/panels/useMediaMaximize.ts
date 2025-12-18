/**
 * useMediaMaximize Hook
 *
 * Handles maximize/restore logic for media panel using dockview API.
 * Intelligently detects current state by checking actual panel height.
 */

import { useCallback, useMemo } from 'react';
import type { DockviewApi } from 'dockview-core';

interface UseMediaMaximizeOptions {
  dockviewApi?: DockviewApi;
  maximizedHeight?: number; // Percentage (default: 0.95)
  normalHeight?: number; // Percentage (default: 0.75)
}

export function useMediaMaximize({
  dockviewApi,
  maximizedHeight = 0.95,
  normalHeight = 0.75,
}: UseMediaMaximizeOptions = {}) {

  /**
   * Check if the media panel is currently in maximized state
   * by comparing its actual height to the maximized/normal thresholds
   */
  const isMaximized = useMemo(() => {
    if (!dockviewApi || dockviewApi.groups.length < 2) return false;

    try {
      const mediaGroup = dockviewApi.groups[0];
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
    } catch (e) {
      return false;
    }
  }, [dockviewApi, dockviewApi?.groups, maximizedHeight, normalHeight]);

  const toggleMaximize = useCallback(() => {
    if (!dockviewApi) {
      console.warn('[useMediaMaximize] Dockview API not available');
      return;
    }

    try {
      const groups = dockviewApi.groups;

      if (groups.length >= 2) {
        const viewportHeight = window.innerHeight;
        const mediaGroupId = groups[0].id;
        const mediaGroup = dockviewApi.getGroup(mediaGroupId);

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

        console.log('[useMediaMaximize] Current height:', currentHeight, 'px');
        console.log('[useMediaMaximize] Currently maximized?', currentlyMaximized);
        console.log('[useMediaMaximize] Setting height to:', newHeight, 'px');

        mediaGroup.api.setSize({ height: newHeight });
      } else {
        console.warn('[useMediaMaximize] Expected 2+ groups but found', groups.length);
      }
    } catch (e) {
      console.warn('[useMediaMaximize] Failed to toggle maximize:', e);
    }
  }, [dockviewApi, maximizedHeight, normalHeight]);

  return {
    isMaximized,
    toggleMaximize,
  };
}
