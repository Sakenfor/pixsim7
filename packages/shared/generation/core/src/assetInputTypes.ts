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
 * USAGE:
 * - Use compositionAssets for all operations that accept media inputs
 * - sourceAssetId/sourceAssetIds are legacy and will be removed
 */
import type { CompositionAsset } from '@pixsim7/shared.types';

/**
 * Canonical asset input for generation operations.
 *
 * Backend resolves asset IDs to provider-specific URLs via provider_uploads.
 *
 * @example
 * // Single asset (image_to_video, video_extend)
 * const input: AssetInput = {
 *   compositionAssets: [{ asset: 123, media_type: 'image', role: 'source_image' }],
 * };
 *
 * @example
 * // Multiple assets (video_transition)
 * const input: AssetInput = {
 *   compositionAssets: [
 *     { asset: 123, media_type: 'image', role: 'transition_input' },
 *     { asset: 456, media_type: 'image', role: 'transition_input' },
 *     { asset: 789, media_type: 'image', role: 'transition_input' },
 *   ],
 * };
 *
 * @example
 * // Multi-image composition (image_to_image, fusion)
 * const input: AssetInput = {
 *   compositionAssets: [{ asset: 123, role: 'main_character' }],
 * };
 *
 * @example
 * // Video with locked timestamp (frame extraction)
 * const input: AssetInput = { sourceAssetId: 123, lockedTimestamp: 5.5 };
 */
export interface AssetInput {
  /**
   * Asset ID for single-asset operations (legacy).
   * Prefer compositionAssets.
   */
  sourceAssetId?: number;

  /**
   * Asset IDs for multi-asset operations (legacy).
   * Prefer compositionAssets.
   */
  sourceAssetIds?: number[];

  /**
   * Role-aware composition assets for all media-input operations.
   */
  compositionAssets?: CompositionAsset[];

  /**
   * Locked timestamp for video frame extraction (in seconds).
   * When set on a video asset, backend extracts a frame at this timestamp.
   */
  lockedTimestamp?: number;
}

/**
 * Check if params contain asset ID references
 */
export function hasAssetIdParams(params: Record<string, any>): boolean {
  return (
    (Array.isArray(params.composition_assets) && params.composition_assets.length > 0) ||
    params.source_asset_id !== undefined ||
    (Array.isArray(params.source_asset_ids) && params.source_asset_ids.length > 0)
  );
}

/**
 * Extract asset input from dynamic params in the canonical format.
 * Useful for converting from Record<string, any> to typed AssetInput.
 */
export function extractAssetInput(params: Record<string, any>): AssetInput {
  return {
    sourceAssetId: params.source_asset_id,
    sourceAssetIds: params.source_asset_ids,
    compositionAssets: params.composition_assets,
    lockedTimestamp: params.locked_timestamp ?? params.lockedTimestamp,
  };
}
