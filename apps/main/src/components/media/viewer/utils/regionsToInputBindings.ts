/**
 * Bridge utility: Convert region annotations to InputBinding format.
 *
 * Maps exported regions from the asset region store to the InputBinding
 * format used by MultiImageEditPrompt for multi-image composition.
 */

import type { ExportedRegion } from '@features/mediaViewer';
import { labelToInfluenceRegion } from '@pixsim7/shared.types';

// ============================================================================
// Types
// ============================================================================

/**
 * InputBinding format matching backend schema.
 * Used in MultiImageEditPrompt.input_bindings
 */
export interface InputBinding {
  /** Reference token used in prompt: 'image_1', 'src_face', etc. */
  ref_name: string;
  /** Asset ID (number or string) */
  asset: number | string;
  /** How this input influences the output */
  influence_type?: 'content' | 'style' | 'structure' | 'mask' | 'blend' | 'replacement' | 'reference';
  /** Target region: full, foreground, background, subject:N, mask:<label> */
  influence_region?: string;
  /** Expected role: subject, replacement, style_ref, background */
  role?: string;
}

/**
 * Options for converting regions to input bindings.
 */
export interface RegionsToBindingsOptions {
  /** Prefix for generated ref_names (default: 'region') */
  refNamePrefix?: string;
  /** Default influence type if not specified (default: 'content') */
  defaultInfluenceType?: InputBinding['influence_type'];
  /** Include region bounds as metadata */
  includeBounds?: boolean;
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert a single exported region to an InputBinding.
 *
 * @param region - Exported region from asset region store
 * @param assetId - Asset ID this region belongs to
 * @param refName - Reference name for the binding
 * @param options - Conversion options
 * @returns InputBinding for use in MultiImageEditPrompt
 */
export function regionToInputBinding(
  region: ExportedRegion,
  assetId: string | number,
  refName: string,
  options: RegionsToBindingsOptions = {}
): InputBinding {
  const { defaultInfluenceType = 'content' } = options;

  return {
    ref_name: refName,
    asset: assetId,
    influence_type: defaultInfluenceType,
    influence_region: labelToInfluenceRegion(region.label),
  };
}

/**
 * Convert multiple exported regions to InputBinding array.
 *
 * @param regions - Exported regions from asset region store
 * @param assetId - Asset ID these regions belong to
 * @param options - Conversion options
 * @returns Array of InputBindings for use in MultiImageEditPrompt
 *
 * @example
 * ```ts
 * const regions = exportRegions(assetId);
 * const bindings = regionsToInputBindings(regions, assetId, { refNamePrefix: 'src' });
 * // Result: [
 * //   { ref_name: 'src_1', asset: 123, influence_region: 'mask:face' },
 * //   { ref_name: 'src_2', asset: 123, influence_region: 'mask:pose' },
 * // ]
 * ```
 */
export function regionsToInputBindings(
  regions: ExportedRegion[],
  assetId: string | number,
  options: RegionsToBindingsOptions = {}
): InputBinding[] {
  const { refNamePrefix = 'region' } = options;

  return regions.map((region, index) => {
    const refName = `${refNamePrefix}_${index + 1}`;
    return regionToInputBinding(region, assetId, refName, options);
  });
}

/**
 * Convert regions from multiple assets to a flat InputBinding array.
 * Useful when composing from multiple source assets.
 *
 * @param assetRegions - Map of assetId -> regions
 * @param options - Conversion options
 * @returns Flat array of InputBindings from all assets
 *
 * @example
 * ```ts
 * const bindings = multiAssetRegionsToInputBindings({
 *   '123': [{ label: 'face', ... }],
 *   '456': [{ label: 'pose', ... }],
 * });
 * // Result: [
 * //   { ref_name: 'asset_123_1', asset: 123, influence_region: 'mask:face' },
 * //   { ref_name: 'asset_456_1', asset: 456, influence_region: 'mask:pose' },
 * // ]
 * ```
 */
export function multiAssetRegionsToInputBindings(
  assetRegions: Record<string | number, ExportedRegion[]>,
  options: RegionsToBindingsOptions = {}
): InputBinding[] {
  const bindings: InputBinding[] = [];

  for (const [assetId, regions] of Object.entries(assetRegions)) {
    const assetBindings = regionsToInputBindings(regions, assetId, {
      ...options,
      refNamePrefix: `asset_${assetId}`,
    });
    bindings.push(...assetBindings);
  }

  return bindings;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a simple InputBinding for a full asset (no specific region).
 * Useful when an asset should be used in its entirety.
 *
 * @param assetId - Asset ID
 * @param refName - Reference name
 * @param influenceType - How this asset influences the output
 * @returns InputBinding with influence_region: 'full'
 */
export function createFullAssetBinding(
  assetId: string | number,
  refName: string,
  influenceType: InputBinding['influence_type'] = 'content'
): InputBinding {
  return {
    ref_name: refName,
    asset: assetId,
    influence_type: influenceType,
    influence_region: 'full',
  };
}

/**
 * Create InputBinding for background extraction.
 *
 * @param assetId - Asset ID
 * @param refName - Reference name (default: 'bg')
 * @returns InputBinding with influence_region: 'background'
 */
export function createBackgroundBinding(
  assetId: string | number,
  refName: string = 'bg'
): InputBinding {
  return {
    ref_name: refName,
    asset: assetId,
    influence_type: 'content',
    influence_region: 'background',
  };
}

/**
 * Create InputBinding for foreground/subject extraction.
 *
 * @param assetId - Asset ID
 * @param refName - Reference name (default: 'fg')
 * @param subjectIndex - Subject index for multi-subject images (default: 0)
 * @returns InputBinding with influence_region: 'foreground' or 'subject:N'
 */
export function createForegroundBinding(
  assetId: string | number,
  refName: string = 'fg',
  subjectIndex?: number
): InputBinding {
  return {
    ref_name: refName,
    asset: assetId,
    influence_type: 'content',
    influence_region: subjectIndex !== undefined ? `subject:${subjectIndex}` : 'foreground',
  };
}

/**
 * Create InputBinding for style reference.
 *
 * @param assetId - Asset ID
 * @param refName - Reference name (default: 'style')
 * @returns InputBinding with influence_type: 'style'
 */
export function createStyleBinding(
  assetId: string | number,
  refName: string = 'style'
): InputBinding {
  return {
    ref_name: refName,
    asset: assetId,
    influence_type: 'style',
    influence_region: 'full',
  };
}
