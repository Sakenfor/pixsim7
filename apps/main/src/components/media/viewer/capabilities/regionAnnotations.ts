/**
 * Region Annotations Capability
 *
 * Exposes region annotations for the current asset via the capability system.
 * This allows other panels to:
 * - Read regions for prompt generation
 * - Display region summaries
 * - React to region changes
 *
 * Integrates with:
 * - SmartDockview context flow
 * - ContextHub capability system
 * - Asset viewer panel context
 */

import { useCallback, useMemo } from 'react';
import {
  registerCapabilityDescriptor,
  useProvideCapability,
  useCapability,
  type CapabilityProvider,
} from '@features/contextHub';
import {
  useAssetRegionStore,
  type AssetRegion,
  type ExportedRegion,
} from '../stores/assetRegionStore';

/** Stable empty array to avoid infinite re-renders */
const EMPTY_REGIONS: AssetRegion[] = [];

// ============================================================================
// Capability Key
// ============================================================================

export const CAP_REGION_ANNOTATIONS = 'regionAnnotations' as const;

// ============================================================================
// Capability Type
// ============================================================================

/**
 * Region annotations capability value.
 * Provides read access to regions and actions for manipulation.
 */
export interface RegionAnnotationsCapability {
  /** Current asset ID (if any) */
  assetId: string | number | null;
  /** All regions for the current asset */
  regions: AssetRegion[];
  /** Currently selected region ID */
  selectedRegionId: string | null;
  /** Whether annotation mode is active */
  annotationMode: boolean;
  /** Current drawing mode */
  drawingMode: 'rect' | 'polygon' | 'select';

  // Actions
  /** Select a region by ID */
  selectRegion: (regionId: string | null) => void;
  /** Toggle annotation mode */
  setAnnotationMode: (enabled: boolean) => void;
  /** Set drawing mode */
  setDrawingMode: (mode: 'rect' | 'polygon' | 'select') => void;
  /** Export regions as structured data for prompt generation */
  exportRegions: () => ExportedRegion[];
  /** Clear all regions for current asset */
  clearRegions: () => void;

  // Derived data
  /** Count of regions */
  regionCount: number;
  /** Whether there are any regions */
  hasRegions: boolean;
  /** Labels of all regions (for quick display) */
  labels: string[];
}

// ============================================================================
// Register Capability Descriptor
// ============================================================================

registerCapabilityDescriptor({
  key: CAP_REGION_ANNOTATIONS,
  label: 'Region Annotations',
  description: 'Regions annotated on the current asset for prompt generation.',
  kind: 'context',
  source: 'media-viewer',
});

// ============================================================================
// Provider Hook
// ============================================================================

interface UseProvideRegionAnnotationsOptions {
  /** Current asset ID */
  assetId: string | number | null;
  /** Provider ID (should be unique per panel instance) */
  providerId?: string;
  /** Priority (higher = preferred) */
  priority?: number;
}

/**
 * Hook to provide region annotations capability.
 * Call this in the MediaPanel or annotation overlay to expose regions.
 */
export function useProvideRegionAnnotations({
  assetId,
  providerId = 'media-panel',
  priority = 50,
}: UseProvideRegionAnnotationsOptions) {
  // Get store state and actions
  const regions = useAssetRegionStore((s) =>
    assetId ? s.getRegions(assetId) : EMPTY_REGIONS
  );
  const selectedRegionId = useAssetRegionStore((s) => s.selectedRegionId);
  const annotationMode = useAssetRegionStore((s) => s.annotationMode);
  const drawingMode = useAssetRegionStore((s) => s.drawingMode);

  const selectRegion = useAssetRegionStore((s) => s.selectRegion);
  const setAnnotationMode = useAssetRegionStore((s) => s.setAnnotationMode);
  const setDrawingMode = useAssetRegionStore((s) => s.setDrawingMode);
  const exportRegionsFromStore = useAssetRegionStore((s) => s.exportRegions);
  const clearAssetRegions = useAssetRegionStore((s) => s.clearAssetRegions);

  // Memoize actions that depend on assetId
  const exportRegions = useCallback(() => {
    if (!assetId) return [];
    return exportRegionsFromStore(assetId);
  }, [assetId, exportRegionsFromStore]);

  const clearRegions = useCallback(() => {
    if (assetId) {
      clearAssetRegions(assetId);
    }
  }, [assetId, clearAssetRegions]);

  // Build capability value
  const capabilityValue = useMemo<RegionAnnotationsCapability>(
    () => ({
      assetId,
      regions,
      selectedRegionId,
      annotationMode,
      drawingMode,
      selectRegion,
      setAnnotationMode,
      setDrawingMode,
      exportRegions,
      clearRegions,
      regionCount: regions.length,
      hasRegions: regions.length > 0,
      labels: regions.map((r) => r.label),
    }),
    [
      assetId,
      regions,
      selectedRegionId,
      annotationMode,
      drawingMode,
      selectRegion,
      setAnnotationMode,
      setDrawingMode,
      exportRegions,
      clearRegions,
    ]
  );

  // Build provider
  const provider = useMemo<CapabilityProvider<RegionAnnotationsCapability>>(
    () => ({
      id: providerId,
      label: 'Region Annotations',
      description: `Regions for asset ${assetId}`,
      priority,
      exposeToContextMenu: true,
      isAvailable: () => assetId !== null,
      getValue: () => capabilityValue,
    }),
    [providerId, assetId, priority, capabilityValue]
  );

  // Register provider
  useProvideCapability(CAP_REGION_ANNOTATIONS, provider, [capabilityValue]);

  return capabilityValue;
}

// ============================================================================
// Consumer Hook
// ============================================================================

/**
 * Hook to consume region annotations capability.
 * Use this in panels that need to read or display regions.
 *
 * @example
 * ```tsx
 * function PromptPanel() {
 *   const { regions, exportRegions } = useRegionAnnotations();
 *
 *   const handleGenerate = () => {
 *     const regionData = exportRegions();
 *     // Use regionData in prompt...
 *   };
 * }
 * ```
 */
export function useRegionAnnotations(): RegionAnnotationsCapability | null {
  const { value } = useCapability<RegionAnnotationsCapability>(CAP_REGION_ANNOTATIONS);
  return value;
}

/**
 * Hook to check if region annotations are available.
 */
export function useHasRegionAnnotations(): boolean {
  const { value } = useCapability<RegionAnnotationsCapability>(CAP_REGION_ANNOTATIONS);
  return value?.hasRegions ?? false;
}
