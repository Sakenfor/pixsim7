/**
 * Asset Events
 *
 * Simple event bus for notifying components when new assets are created.
 * Used to bridge generation completions with gallery updates.
 */

import type { AssetResponse } from '@lib/api/assets';

import { isBackendAssetId } from './backendAssetId';

type AssetEventCallback = (asset: AssetResponse) => void;
type AssetUpdateCallback = (asset: AssetResponse) => void;
type AssetDeleteCallback = (assetId: number | string) => void;
type RetryCallback = () => void;
type OpenToolsPanelCallback = (assetIds: number[]) => void;

class AssetEventEmitter {
  private listeners: Set<AssetEventCallback> = new Set();
  private updateListeners: Set<AssetUpdateCallback> = new Set();
  private deleteListeners: Set<AssetDeleteCallback> = new Set();
  private retryListeners: Set<RetryCallback> = new Set();
  private openToolsPanelListeners: Set<OpenToolsPanelCallback> = new Set();

  /**
   * Subscribe to new asset events
   */
  subscribe(callback: AssetEventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Subscribe to asset update events
   */
  subscribeToUpdates(callback: AssetUpdateCallback): () => void {
    this.updateListeners.add(callback);
    return () => {
      this.updateListeners.delete(callback);
    };
  }

  /**
   * Subscribe to asset delete events
   */
  subscribeToDeletes(callback: AssetDeleteCallback): () => void {
    this.deleteListeners.add(callback);
    return () => {
      this.deleteListeners.delete(callback);
    };
  }

  /**
   * Emit a new asset event (called when generation completes)
   */
  emitAssetCreated(asset: AssetResponse): void {
    console.log('[AssetEvents] New asset created:', asset.id, `(${this.listeners.size} subscriber(s))`);
    this.listeners.forEach((callback) => {
      try {
        callback(asset);
      } catch (err) {
        console.error('[AssetEvents] Listener error:', err);
      }
    });
  }

  /**
   * Emit an asset update event (called when asset is synced/updated)
   */
  emitAssetUpdated(asset: AssetResponse): void {
    console.log('[AssetEvents] Asset updated:', asset.id);
    this.updateListeners.forEach((callback) => {
      try {
        callback(asset);
      } catch (err) {
        console.error('[AssetEvents] Update listener error:', err);
      }
    });
  }

  /**
   * Emit an asset delete event
   */
  emitAssetDeleted(assetId: number | string): void {
    console.log('[AssetEvents] Asset deleted:', assetId);
    this.deleteListeners.forEach((callback) => {
      try {
        callback(assetId);
      } catch (err) {
        console.error('[AssetEvents] Delete listener error:', err);
      }
    });
  }

  /**
   * Subscribe to retry-all-thumbnails events
   */
  subscribeToRetry(callback: RetryCallback): () => void {
    this.retryListeners.add(callback);
    return () => {
      this.retryListeners.delete(callback);
    };
  }

  /**
   * Emit retry-all event to trigger all failed thumbnails to retry
   */
  emitRetryAllThumbnails(): void {
    console.log('[AssetEvents] Retry all thumbnails triggered');
    this.retryListeners.forEach((callback) => {
      try {
        callback();
      } catch (err) {
        console.error('[AssetEvents] Retry listener error:', err);
      }
    });
  }

  /**
   * Subscribe to open-tools-panel events
   */
  subscribeToOpenToolsPanel(callback: OpenToolsPanelCallback): () => void {
    this.openToolsPanelListeners.add(callback);
    return () => {
      this.openToolsPanelListeners.delete(callback);
    };
  }

  /**
   * Emit open-tools-panel event to select assets and show the tools panel
   */
  emitOpenToolsPanel(assetIds: number[]): void {
    const validIds = assetIds.filter(isBackendAssetId);
    if (validIds.length !== assetIds.length) {
      console.warn(
        '[AssetEvents] Dropped non-backend asset ids from openToolsPanel:',
        assetIds.filter((id) => !isBackendAssetId(id)),
      );
    }
    if (validIds.length === 0) return;
    console.log('[AssetEvents] Open tools panel for assets:', validIds);
    this.openToolsPanelListeners.forEach((callback) => {
      try {
        callback(validIds);
      } catch (err) {
        console.error('[AssetEvents] Open tools panel listener error:', err);
      }
    });
  }
}

import { hmrSingleton } from '@lib/utils';

export const assetEvents = hmrSingleton('assetEvents', () => new AssetEventEmitter());
