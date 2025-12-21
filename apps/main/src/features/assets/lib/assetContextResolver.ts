/**
 * Asset Context Resolver
 *
 * In-memory cache for assets that are currently rendered.
 * Components register their assets when mounting, allowing the context menu
 * to resolve full asset data from just an ID.
 *
 * Usage:
 * ```tsx
 * // In component - register asset on render
 * useEffect(() => {
 *   assetContextCache.register(asset);
 *   return () => assetContextCache.unregister(asset.id);
 * }, [asset]);
 *
 * // Or use the convenience hook
 * useRegisterAssetContext(asset);
 * ```
 */

import { useEffect } from 'react';
import { contextDataRegistry } from '@lib/dockview/contextMenu';
import type { AssetResponse } from './api';

/**
 * In-memory cache of rendered assets.
 * Uses a Map for O(1) lookups.
 */
class AssetContextCache {
  private assets = new Map<number | string, AssetResponse>();

  /**
   * Register an asset in the cache.
   * Call when component mounts or asset changes.
   */
  register(asset: AssetResponse): void {
    this.assets.set(asset.id, asset);
  }

  /**
   * Unregister an asset from the cache.
   * Call when component unmounts.
   */
  unregister(id: number | string): void {
    this.assets.delete(id);
  }

  /**
   * Get an asset by ID.
   * Returns null if not in cache.
   */
  get(id: number | string): AssetResponse | null {
    return this.assets.get(id) ?? this.assets.get(Number(id)) ?? null;
  }

  /**
   * Check if an asset is in the cache.
   */
  has(id: number | string): boolean {
    return this.assets.has(id) || this.assets.has(Number(id));
  }

  /**
   * Clear the entire cache.
   * Useful for cleanup on logout or page navigation.
   */
  clear(): void {
    this.assets.clear();
  }

  /**
   * Get count of cached assets.
   */
  get size(): number {
    return this.assets.size;
  }
}

/** Global asset context cache */
export const assetContextCache = new AssetContextCache();

/**
 * Hook to register an asset in the context cache.
 * Automatically registers on mount and unregisters on unmount.
 */
export function useRegisterAssetContext(asset: AssetResponse | null | undefined): void {
  useEffect(() => {
    if (!asset) return;
    assetContextCache.register(asset);
    return () => {
      assetContextCache.unregister(asset.id);
    };
  }, [asset?.id, asset]);
}

/**
 * Register the asset resolver with the context data registry.
 * Call this once at app initialization.
 */
export function registerAssetResolver(): void {
  contextDataRegistry.register('asset', (id) => {
    const asset = assetContextCache.get(id);
    if (!asset) return null;

    return {
      // Core asset info
      id: asset.id,
      name: asset.description || asset.provider_asset_id || `Asset ${asset.id}`,
      type: asset.media_type,

      // Full asset for actions that need it
      asset,

      // Common fields for quick access
      provider: asset.provider_id,
      providerAssetId: asset.provider_asset_id,
      thumbnailUrl: asset.thumbnail_url,
      isLocalOnly: asset.provider_status === 'local_only' || !asset.remote_url,
    };
  });
}
