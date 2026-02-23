import { useToastStore } from '@pixsim7/shared.ui';
import { useCallback, useMemo } from 'react';

import { extractErrorMessage } from '@lib/api/errorHandling';

import type { AssetModel } from '@features/assets';
import { toSelectedAsset } from '@features/assets';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import {
  CAP_GENERATION_WIDGET,
  type GenerationWidgetContext,
  useCapability,
} from '@features/contextHub';

import type { OperationType } from '@/types/operations';

import { useGenerationScopeStores } from './useGenerationScope';

/**
 * Hook: useMediaGenerationActions
 *
 * Centralizes gallery generation actions so MediaCard and widgets
 * can add inputs and open the nearest generation widget consistently.
 *
 * Uses the centralized input store API for automatic routing
 * based on operation metadata.
 *
 * Scope-aware: Uses useGenerationScopeStores() to read from the current
 * generation scope (panel-local or global). This allows quick actions
 * to use the appropriate settings context.
 *
 * When assets are added via quick actions:
 * - The asset is added to the appropriate operation inputs (auto-routed)
 * - The asset is selected in the asset selection store
 * - The generation operation type is aligned when possible
 * - The active generation widget is opened (if available)
 */
export function useMediaGenerationActions() {
  // Use scoped stores for scope-aware generation settings
  const { useSessionStore, useInputStore } = useGenerationScopeStores();
  const scopedAddInputs = useInputStore((s) => s.addInputs);

  // Read operation type from scoped session store
  const sessionOperationType = useSessionStore((s) => s.operationType);
  const setSessionOperationType = useSessionStore((s) => s.setOperationType);

  const selectAsset = useAssetSelectionStore((s) => s.selectAsset);

  const { value: widgetContext } = useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  const currentOperationType = widgetContext?.operationType ?? sessionOperationType;

  const openGenerationWidget = useCallback(
    (operationType?: OperationType) => {
      if (!widgetContext) return false;
      if (operationType && widgetContext.setOperationType) {
        widgetContext.setOperationType(operationType);
      }
      widgetContext.setOpen(true);
      return true;
    },
    [widgetContext],
  );

  const setOperationType = useCallback(
    (operationType: OperationType) => {
      if (widgetContext?.setOperationType) {
        widgetContext.setOperationType(operationType);
        return;
      }
      setSessionOperationType(operationType);
    },
    [setSessionOperationType, widgetContext],
  );

  const addInputs = useCallback(
    (options: {
      assets: AssetModel[];
      operationType: OperationType;
    }) => {
      if (widgetContext?.addInputs) {
        widgetContext.addInputs(options);
        return;
      }
      if (widgetContext?.addInput) {
        options.assets.forEach((asset) => {
          widgetContext.addInput({
            asset,
            operationType: options.operationType,
          });
        });
        return;
      }
      scopedAddInputs(options);
    },
    [scopedAddInputs, widgetContext],
  );

  // Helper to select asset in selection store
  const selectAssetFromSummary = useCallback((asset: AssetModel) => {
    selectAsset(toSelectedAsset(asset, 'gallery'));
  }, [selectAsset]);

  // Smart input action - routes based on operation metadata
  const createQueueAction = useCallback(
    (operationType: OperationType) => (asset: AssetModel) => {
      // Use centralized input store which handles routing automatically
      addInputs({ assets: [asset], operationType });

      selectAssetFromSummary(asset);

      // Only set operation type if it's different to avoid resetting settings
      if (currentOperationType !== operationType) {
        setOperationType(operationType);
      }

      openGenerationWidget(operationType);
    },
    [addInputs, selectAssetFromSummary, setOperationType, currentOperationType, openGenerationWidget],
  );

  // Memoize individual actions for stable references
  const queueImageToImage = useMemo(() => createQueueAction('image_to_image'), [createQueueAction]);
  const queueImageToVideo = useMemo(() => createQueueAction('image_to_video'), [createQueueAction]);
  const queueVideoExtend = useMemo(() => createQueueAction('video_extend'), [createQueueAction]);
  const queueAddToTransition = useMemo(() => createQueueAction('video_transition'), [createQueueAction]);

  const queueAutoGenerate = useCallback(
    (asset: AssetModel) => {
      // Auto-generate uses current operation type for routing
      addInputs({ assets: [asset], operationType: currentOperationType });
      selectAssetFromSummary(asset);
      openGenerationWidget(currentOperationType);
    },
    [addInputs, currentOperationType, selectAssetFromSummary, openGenerationWidget],
  );

  // Silent add - adds inputs without opening control center
  const queueSilentAdd = useCallback(
    (asset: AssetModel) => {
      // Silent add uses current operation type for routing
      addInputs({ assets: [asset], operationType: currentOperationType });
      selectAssetFromSummary(asset);
      // Don't open control center - just add inputs
    },
    [addInputs, currentOperationType, selectAssetFromSummary],
  );

  // Quick generate - delegates to the controller's generateWithAsset method
  // which uses the full generation pipeline (provider resolution, param building, etc.)
  // When count > 1, triggers burst mode (multiple generations).
  // Optional duration override from gesture secondary axis.
  const quickGenerate = useCallback(
    async (asset: AssetModel, options?: { addToQueue?: boolean; count?: number; duration?: number }) => {
      // Optionally add to inputs (default: no)
      if (options?.addToQueue) {
        addInputs({ assets: [asset], operationType: currentOperationType });
        selectAssetFromSummary(asset);
      }

      if (!widgetContext?.generateWithAsset) {
        useToastStore.getState().addToast({
          type: 'error',
          message: 'No generation widget available for quick generate',
          duration: 4000,
        });
        return;
      }

      try {
        await widgetContext.generateWithAsset(asset, options?.count, { duration: options?.duration });
      } catch (err) {
        useToastStore.getState().addToast({
          type: 'error',
          message: `Quick generate failed: ${extractErrorMessage(err)}`,
          duration: 4000,
        });
      }
    },
    [addInputs, currentOperationType, selectAssetFromSummary, widgetContext],
  );

  return {
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    queueSilentAdd,
    quickGenerate,
  };
}
