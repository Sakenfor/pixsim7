/**
 * Asset Events
 *
 * Simple event bus for notifying components when new assets are created.
 * Used to bridge generation completions with gallery updates.
 */

import type { AssetResponse } from '@lib/api/assets';

type AssetEventCallback = (asset: AssetResponse) => void;

class AssetEventEmitter {
  private listeners: Set<AssetEventCallback> = new Set();

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
   * Emit a new asset event (called when generation completes)
   */
  emitAssetCreated(asset: AssetResponse): void {
    console.log('[AssetEvents] New asset created:', asset.id);
    this.listeners.forEach((callback) => {
      try {
        callback(asset);
      } catch (err) {
        console.error('[AssetEvents] Listener error:', err);
      }
    });
  }
}

export const assetEvents = new AssetEventEmitter();
