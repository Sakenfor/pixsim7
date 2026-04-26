/**
 * Viewer Open Events
 *
 * Emitted whenever `assetViewerStore.openViewer` is called — i.e. a fresh
 * outside-viewer open (gallery click, double-click on a card, programmatic
 * open). Navigation via prev/next does NOT emit, so subscribers see only
 * deliberate user opens.
 *
 * Used by `useHistoryScope` to build a session view-history scope.
 */

import { hmrSingleton } from '@lib/utils';

import type { ViewerAsset } from '../stores/assetViewerStore';

type ViewerOpenCallback = (asset: ViewerAsset) => void;

class ViewerOpenEmitter {
  private listeners: Set<ViewerOpenCallback> = new Set();

  subscribe(callback: ViewerOpenCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  emit(asset: ViewerAsset): void {
    this.listeners.forEach((callback) => {
      try {
        callback(asset);
      } catch (err) {
        console.error('[ViewerOpenEvents] Listener error:', err);
      }
    });
  }
}

export const viewerOpenEvents = hmrSingleton('viewerOpenEvents', () => new ViewerOpenEmitter());
