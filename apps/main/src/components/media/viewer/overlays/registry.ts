import { useCallback, useSyncExternalStore } from 'react';

import { BaseRegistry } from '@lib/core/BaseRegistry';

import type { MediaOverlayTool, MediaOverlayId } from './types';

class MediaOverlayRegistry extends BaseRegistry<MediaOverlayTool> {
  private cachedSorted: MediaOverlayTool[] | null = null;

  getSorted(): MediaOverlayTool[] {
    if (this.cachedSorted === null) {
      this.cachedSorted = this.getAll().sort((a, b) => {
        const pa = a.priority ?? 100;
        const pb = b.priority ?? 100;
        if (pa !== pb) return pa - pb;
        return a.label.localeCompare(b.label);
      });
    }
    return this.cachedSorted;
  }

  protected override notifyListeners(): void {
    this.cachedSorted = null; // Invalidate cache when registry changes
    super.notifyListeners();
  }

  getById(id: MediaOverlayId): MediaOverlayTool | undefined {
    return this.get(id);
  }
}

export const mediaOverlayRegistry = new MediaOverlayRegistry();

const DEFAULT_OVERLAY_PRIORITY = 100;

export function registerMediaOverlay(tool: MediaOverlayTool): void {
  mediaOverlayRegistry.register({
    ...tool,
    priority: tool.priority ?? DEFAULT_OVERLAY_PRIORITY,
  });
}

export function useMediaOverlayRegistry() {
  const subscribe = useCallback(
    (callback: () => void) => mediaOverlayRegistry.subscribe(callback),
    []
  );

  const getSnapshot = useCallback(() => mediaOverlayRegistry.getSorted(), []);

  const overlays = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    overlays,
    getOverlay: (id: MediaOverlayId) => mediaOverlayRegistry.getById(id),
  };
}

export function useMediaOverlayTool(id: MediaOverlayId): MediaOverlayTool | undefined {
  const subscribe = useCallback(
    (callback: () => void) => mediaOverlayRegistry.subscribe(callback),
    []
  );

  const getSnapshot = useCallback(() => mediaOverlayRegistry.getById(id), [id]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
