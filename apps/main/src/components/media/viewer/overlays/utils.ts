/**
 * Overlay Utilities
 *
 * Shared helpers for overlay components.
 */

import { denormalizeRect } from '@pixsim7/graphics.geometry';

import type { AssetRegion } from '@features/mediaViewer';

/**
 * Find the active region from a list of regions.
 *
 * Priority:
 * 1. Selected region (by ID)
 * 2. Single region (if only one exists)
 * 3. Most recent region (last in array)
 *
 * @param regions - List of regions
 * @param selectedRegionId - Currently selected region ID (if any)
 * @returns The active region or null
 */
export function findActiveRegion(
  regions: AssetRegion[],
  selectedRegionId: string | null
): AssetRegion | null {
  if (selectedRegionId) {
    const selected = regions.find((r) => r.id === selectedRegionId);
    if (selected) {
      return selected;
    }
  }
  if (regions.length === 1) {
    return regions[0];
  }
  if (regions.length > 1) {
    return regions[regions.length - 1];
  }
  return null;
}

/**
 * Calculate pixel dimensions from normalized region bounds.
 *
 * @param bounds - Normalized bounds (0-1)
 * @param mediaDimensions - Media width/height in pixels (video or image)
 * @returns Pixel dimensions or null if invalid
 */
export function getRegionPixelDimensions(
  bounds: { width: number; height: number } | undefined,
  mediaDimensions: { width: number; height: number } | undefined
): { width: number; height: number } | null {
  if (!bounds || !mediaDimensions) return null;

  const rect = denormalizeRect(
    { x: 0, y: 0, width: bounds.width, height: bounds.height },
    mediaDimensions.width,
    mediaDimensions.height
  );
  const pw = Math.round(rect.width);
  const ph = Math.round(rect.height);

  if (pw < 1 || ph < 1) return null;
  return { width: pw, height: ph };
}
