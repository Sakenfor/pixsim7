/**
 * useMediaMaximize Hook
 *
 * Handles maximize/restore logic for media panel using dockview API.
 * Always reads actual panel height to determine state (no stale closures).
 * Saves pre-maximize height so restore returns to exact previous position.
 */

import type { DockviewApi } from 'dockview-core';
import { useCallback, useRef, useSyncExternalStore, type MutableRefObject } from 'react';

import { getDockviewGroupCount, getDockviewGroups, type DockviewHost } from '@lib/dockview';

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

/** Threshold: within 5% of viewport = "close enough" to maximized */
const MAXIMIZE_THRESHOLD = 0.05;

export function useMediaMaximize({
  dockviewApi,
  dockviewApiRef,
  dockviewHost,
  dockviewHostRef,
  maximizedHeight = 0.95,
  normalHeight = 0.75,
}: UseMediaMaximizeOptions = {}) {
  /** Height to restore to when un-maximizing */
  const savedHeight = useRef<number | null>(null);

  // Prefer ref if available, fall back to direct prop
  const getApi = useCallback(
    () => dockviewHostRef?.current?.api ?? dockviewHost?.api ?? dockviewApiRef?.current ?? dockviewApi,
    [dockviewApi, dockviewApiRef, dockviewHost, dockviewHostRef],
  );

  /** Read whether the media group is currently at (or near) maximized height */
  const readIsMaximized = useCallback((): boolean => {
    const api = getApi();
    if (!api) return false;
    try {
      const groups = getDockviewGroups(api);
      if (getDockviewGroupCount(api, groups) < 2) return false;
      const currentHeight = groups[0].api.height;
      const viewportHeight = window.innerHeight;
      const maxHeight = viewportHeight * maximizedHeight;
      return Math.abs(currentHeight - maxHeight) < viewportHeight * MAXIMIZE_THRESHOLD;
    } catch {
      return false;
    }
  }, [getApi, maximizedHeight]);

  // Subscribe to dockview layout changes so React re-renders when the user
  // drags the splitter handle (or when we programmatically resize).
  const isMaximized = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        const api = getApi();
        if (!api) return () => {};
        const disposable = api.onDidLayoutChange(onStoreChange);
        return () => disposable.dispose();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [getApi, dockviewApi],
    ),
    readIsMaximized,
  );

  const toggleMaximize = useCallback(() => {
    const api = getApi();
    if (!api) {
      console.warn('[useMediaMaximize] Dockview API not available');
      return;
    }

    try {
      const groups = getDockviewGroups(api);
      const groupCount = getDockviewGroupCount(api, groups);

      if (groupCount < 2) {
        console.warn('[useMediaMaximize] Expected 2+ groups but found', groupCount);
        return;
      }

      const mediaGroup = api.getGroup(groups[0].id);
      if (!mediaGroup) {
        console.warn('[useMediaMaximize] Media group not found');
        return;
      }

      const currentHeight = mediaGroup.api.height;
      const viewportHeight = window.innerHeight;
      const maxHeight = Math.floor(viewportHeight * maximizedHeight);

      // Determine state from actual measurements — never stale
      const currentlyMaximized = Math.abs(currentHeight - maxHeight) < viewportHeight * MAXIMIZE_THRESHOLD;

      if (currentlyMaximized) {
        // Restore to saved height, or fall back to default normal height
        const restoreHeight = savedHeight.current ?? Math.floor(viewportHeight * normalHeight);
        mediaGroup.api.setSize({ height: restoreHeight });
        savedHeight.current = null;
      } else {
        // Save current height before maximizing
        savedHeight.current = currentHeight;
        mediaGroup.api.setSize({ height: maxHeight });
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
