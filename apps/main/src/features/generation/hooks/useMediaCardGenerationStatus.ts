/**
 * useMediaCardGenerationStatus Hook
 *
 * Hook to easily add generation status tracking to MediaCards.
 * Automatically fetches status from generationsStore and provides
 * the props and widgets needed.
 */
import { useMemo } from 'react';
import { useGenerationsStore, generationsSelectors, isGenerationActive } from '../stores/generationsStore';
import { mapAssetToGeneration } from '@features/generation/lib/core/generationAssetMapping';
import { createGenerationStatusWidget } from '@/components/media/mediaCardWidgets';
import type { MediaCardProps } from '@/components/media/MediaCard';
import type { OverlayWidget } from '@lib/ui/overlay';
import type { MediaCardOverlayData } from '@/components/media/mediaCardWidgets';

export interface GenerationStatusResult {
  // Props to spread onto MediaCard
  generationStatusProps: {
    generationStatus?: MediaCardProps['generationStatus'];
    generationId?: number;
    generationError?: string;
  };
  // Widget to add to customWidgets array
  generationWidget: OverlayWidget<MediaCardOverlayData> | null;
  // Whether this asset has an active generation
  isGenerating: boolean;
  // Whether this asset has a failed generation
  hasFailed: boolean;
}

/**
 * Get generation status for a specific asset and return MediaCard-ready props/widgets
 *
 * @example
 * ```tsx
 * function MyGallery() {
 *   const { generationStatusProps, generationWidget } = useMediaCardGenerationStatus(assetId);
 *
 *   return (
 *     <MediaCard
 *       {...otherProps}
 *       {...generationStatusProps}
 *       customWidgets={generationWidget ? [generationWidget] : []}
 *     />
 *   );
 * }
 * ```
 */
export function useMediaCardGenerationStatus(assetId: number): GenerationStatusResult {
  // Get all generations from store
  const allGenerations = useGenerationsStore(generationsSelectors.all());

  // Map asset to generation status
  const generationInfo = useMemo(() => {
    return mapAssetToGeneration(assetId, allGenerations);
  }, [assetId, allGenerations]);

  // Build MediaCard props
  const generationStatusProps = useMemo(() => {
    if (!generationInfo) {
      return {};
    }

    return {
      generationStatus: generationInfo.status,
      generationId: generationInfo.generationId,
      generationError: generationInfo.errorMessage || undefined,
    };
  }, [generationInfo]);

  // Create widget
  const generationWidget = useMemo(() => {
    if (!generationInfo) {
      return null;
    }

    // Create a mock MediaCardProps with just what we need
    const mockProps: Partial<MediaCardProps> = {
      generationStatus: generationInfo.status,
      generationError: generationInfo.errorMessage || undefined,
      badgeConfig: { showFooterProvider: true }, // Assume provider badge exists
    };

    return createGenerationStatusWidget(mockProps as MediaCardProps);
  }, [generationInfo]);

  // Helper flags
  const isGenerating = generationInfo?.status
    ? isGenerationActive(generationInfo.status)
    : false;

  const hasFailed = generationInfo?.status === 'failed';

  return {
    generationStatusProps,
    generationWidget,
    isGenerating,
    hasFailed,
  };
}

/**
 * Batch version for multiple assets (more efficient)
 *
 * @example
 * ```tsx
 * function MyGallery({ assets }: { assets: Asset[] }) {
 *   const statusMap = useMediaCardGenerationStatusBatch(assets.map(a => a.id));
 *
 *   return (
 *     <>
 *       {assets.map(asset => {
 *         const status = statusMap.get(asset.id);
 *         return (
 *           <MediaCard
 *             {...assetProps(asset)}
 *             {...status?.generationStatusProps}
 *             customWidgets={status?.generationWidget ? [status.generationWidget] : []}
 *           />
 *         );
 *       })}
 *     </>
 *   );
 * }
 * ```
 */
export function useMediaCardGenerationStatusBatch(
  assetIds: number[]
): Map<number, GenerationStatusResult> {
  const allGenerations = useGenerationsStore(generationsSelectors.all());

  return useMemo(() => {
    const resultMap = new Map<number, GenerationStatusResult>();

    for (const assetId of assetIds) {
      const generationInfo = mapAssetToGeneration(assetId, allGenerations);

      if (!generationInfo) {
        resultMap.set(assetId, {
          generationStatusProps: {},
          generationWidget: null,
          isGenerating: false,
          hasFailed: false,
        });
        continue;
      }

      const generationStatusProps = {
        generationStatus: generationInfo.status,
        generationId: generationInfo.generationId,
        generationError: generationInfo.errorMessage || undefined,
      };

      const mockProps: Partial<MediaCardProps> = {
        generationStatus: generationInfo.status,
        generationError: generationInfo.errorMessage || undefined,
        badgeConfig: { showFooterProvider: true },
      };

      const generationWidget = createGenerationStatusWidget(mockProps as MediaCardProps);

      resultMap.set(assetId, {
        generationStatusProps,
        generationWidget,
        isGenerating: isGenerationActive(generationInfo.status),
        hasFailed: generationInfo.status === 'failed',
      });
    }

    return resultMap;
  }, [assetIds, allGenerations]);
}
