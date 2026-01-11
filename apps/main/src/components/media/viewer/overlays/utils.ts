/**
 * Overlay Utilities
 *
 * Shared helpers for overlay components.
 */

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
 * @param videoDimensions - Video width/height in pixels
 * @returns Pixel dimensions or null if invalid
 */
export function getRegionPixelDimensions(
  bounds: { width: number; height: number } | undefined,
  videoDimensions: { width: number; height: number } | undefined
): { width: number; height: number } | null {
  if (!bounds || !videoDimensions) return null;

  const pw = Math.round(bounds.width * videoDimensions.width);
  const ph = Math.round(bounds.height * videoDimensions.height);

  if (pw < 1 || ph < 1) return null;
  return { width: pw, height: ph };
}
