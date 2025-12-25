/**
 * Asset Input Types for Generation Operations
 *
 * This module defines the canonical types for passing asset references to generation
 * operations. The pattern is: frontend passes asset IDs, backend resolves to
 * provider-specific URLs.
 *
 * WHY THIS PATTERN:
 * - Enables provider-specific URL resolution (e.g., Pixverse-hosted URLs from provider_uploads)
 * - Supports asset lineage tracking and deduplication
 * - Decouples frontend from provider URL formats
 *
 * MIGRATION STATUS:
 * - New code should ONLY use sourceAssetId/sourceAssetIds
 * - Legacy params (image_url, video_url, etc.) are deprecated and will be removed
 */

/**
 * Legacy asset input params - DEPRECATED
 *
 * These params are being phased out in favor of sourceAssetId/sourceAssetIds.
 * Backend still accepts them for backwards compatibility, but new code should
 * not use them.
 *
 * @deprecated Use AssetInput instead. Will be removed in a future release.
 */
export interface LegacyAssetInput {
  /** @deprecated Use sourceAssetId instead */
  image_url?: string;
  /** @deprecated Use sourceAssetId instead */
  video_url?: string;
  /** @deprecated Use sourceAssetIds instead */
  image_urls?: string[];
  /** @deprecated Use sourceAssetId instead */
  original_video_id?: number;
}

/**
 * Canonical asset input for generation operations.
 *
 * IMPORTANT: Always use sourceAssetId/sourceAssetIds, never legacy URL params.
 * Backend resolves asset IDs to provider-specific URLs via provider_uploads.
 *
 * @example
 * // Single asset (image_to_video, image_to_image, video_extend)
 * const input: AssetInput = { sourceAssetId: 123 };
 *
 * @example
 * // Multiple assets (video_transition)
 * const input: AssetInput = { sourceAssetIds: [123, 456, 789] };
 *
 * @example
 * // Video with locked timestamp (frame extraction)
 * const input: AssetInput = { sourceAssetId: 123, lockedTimestamp: 5.5 };
 */
export interface AssetInput {
  /**
   * Asset ID for single-asset operations.
   * Used by: image_to_video, image_to_image, video_extend
   */
  sourceAssetId?: number;

  /**
   * Asset IDs for multi-asset operations.
   * Used by: video_transition
   */
  sourceAssetIds?: number[];

  /**
   * Locked timestamp for video frame extraction (in seconds).
   * When set on a video asset, backend extracts a frame at this timestamp.
   */
  lockedTimestamp?: number;
}

/**
 * Keys that are considered legacy asset params.
 * Used by normalizeAssetParams to clean up params when asset IDs are present.
 */
export const LEGACY_ASSET_PARAM_KEYS = [
  'image_url',
  'video_url',
  'image_urls',
  'original_video_id',
] as const;

export type LegacyAssetParamKey = (typeof LEGACY_ASSET_PARAM_KEYS)[number];

/**
 * Check if params contain any legacy asset keys
 */
export function hasLegacyAssetParams(params: Record<string, any>): boolean {
  return LEGACY_ASSET_PARAM_KEYS.some((key) => params[key] !== undefined);
}

/**
 * Check if params contain the new asset ID pattern
 */
export function hasAssetIdParams(params: Record<string, any>): boolean {
  return (
    params.source_asset_id !== undefined ||
    (Array.isArray(params.source_asset_ids) && params.source_asset_ids.length > 0)
  );
}

/**
 * Normalize asset parameters by removing legacy keys when asset IDs are present.
 *
 * This function ensures clean params are sent to the backend by:
 * 1. Checking if source_asset_id or source_asset_ids are present
 * 2. If so, removing all legacy URL-based params
 * 3. Logging a warning in development if both patterns are present
 *
 * Call this function once, right before sending params to the API.
 *
 * @example
 * const params = { source_asset_id: 123, image_url: 'https://...' };
 * const clean = normalizeAssetParams(params);
 * // Result: { source_asset_id: 123 }
 */
export function normalizeAssetParams(params: Record<string, any>): Record<string, any> {
  const result = { ...params };

  const hasAssetIds = hasAssetIdParams(result);
  const hasLegacy = hasLegacyAssetParams(result);

  // Log drift warning in development
  if (hasAssetIds && hasLegacy && process.env.NODE_ENV === 'development') {
    console.warn(
      '[ASSET_PARAM_DRIFT] Both asset IDs and legacy URL params present.',
      'Legacy params will be removed. source_asset_id(s) will be used.',
      '\nLegacy keys found:',
      LEGACY_ASSET_PARAM_KEYS.filter((k) => result[k] !== undefined),
      '\nThis may indicate incomplete migration. Consider updating the source.'
    );
  }

  // Remove legacy keys when asset IDs are present
  if (hasAssetIds) {
    for (const key of LEGACY_ASSET_PARAM_KEYS) {
      delete result[key];
    }
  }

  return result;
}

/**
 * Extract asset input from dynamic params in the canonical format.
 * Useful for converting from Record<string, any> to typed AssetInput.
 */
export function extractAssetInput(params: Record<string, any>): AssetInput {
  return {
    sourceAssetId: params.source_asset_id,
    sourceAssetIds: params.source_asset_ids,
    lockedTimestamp: params.locked_timestamp ?? params.lockedTimestamp,
  };
}
