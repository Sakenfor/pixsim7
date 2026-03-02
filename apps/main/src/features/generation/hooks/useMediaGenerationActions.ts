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

import { upgradeModelForAsset, patchAssetToWidget } from '../lib/assetGenerationActions';

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
  const { id: scopedScopeId, useSessionStore, useInputStore } = useGenerationScopeStores();
  const scopedAddInputs = useInputStore((s) => s.addInputs);

  // Read operation type from scoped session store
  const sessionOperationType = useSessionStore((s) => s.operationType);
  const setSessionOperationType = useSessionStore((s) => s.setOperationType);

  const selectAsset = useAssetSelectionStore((s) => s.selectAsset);

  const { provider: widgetProvider } = useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  const getWidgetContext = useCallback((): GenerationWidgetContext | null => {
    const value = widgetProvider?.getValue?.();
    return value ? (value as GenerationWidgetContext) : null;
  }, [widgetProvider]);
  const getCurrentOperationType = useCallback(
    (): OperationType => getWidgetContext()?.operationType ?? sessionOperationType,
    [getWidgetContext, sessionOperationType],
  );

  const openGenerationWidget = useCallback(
    (operationType?: OperationType) => {
      const widget = getWidgetContext();
      if (!widget) return false;
      if (operationType && widget.setOperationType) {
        widget.setOperationType(operationType);
      }
      widget.setOpen(true);
      return true;
    },
    [getWidgetContext],
  );

  const setOperationType = useCallback(
    (operationType: OperationType) => {
      const widget = getWidgetContext();
      if (widget?.setOperationType) {
        widget.setOperationType(operationType);
        return;
      }
      setSessionOperationType(operationType);
    },
    [getWidgetContext, setSessionOperationType],
  );

  const addInputs = useCallback(
    (options: {
      assets: AssetModel[];
      operationType: OperationType;
    }) => {
      const widget = getWidgetContext();
      if (widget?.addInputs) {
        widget.addInputs(options);
        return;
      }
      if (widget?.addInput) {
        options.assets.forEach((asset) => {
          widget.addInput({
            asset,
            operationType: options.operationType,
          });
        });
        return;
      }
      scopedAddInputs(options);
    },
    [getWidgetContext, scopedAddInputs],
  );

  // Helper to select asset in selection store
  const selectAssetFromSummary = useCallback((asset: AssetModel) => {
    selectAsset(toSelectedAsset(asset, 'gallery'));
  }, [selectAsset]);

  // Smart input action - routes based on operation metadata
  const createQueueAction = useCallback(
    (operationType: OperationType) => (asset: AssetModel) => {
      const currentOperationType = getCurrentOperationType();
      // Use centralized input store which handles routing automatically
      addInputs({ assets: [asset], operationType });

      selectAssetFromSummary(asset);

      // Only set operation type if it's different to avoid resetting settings
      if (currentOperationType !== operationType) {
        setOperationType(operationType);
      }

      openGenerationWidget(operationType);
    },
    [addInputs, selectAssetFromSummary, setOperationType, getCurrentOperationType, openGenerationWidget],
  );

  // Memoize individual actions for stable references
  const queueImageToImage = useMemo(() => createQueueAction('image_to_image'), [createQueueAction]);
  const queueImageToVideo = useMemo(() => createQueueAction('image_to_video'), [createQueueAction]);
  const queueVideoExtend = useMemo(() => createQueueAction('video_extend'), [createQueueAction]);
  const queueAddToTransition = useMemo(() => createQueueAction('video_transition'), [createQueueAction]);

  const queueAutoGenerate = useCallback(
    (asset: AssetModel) => {
      const currentOperationType = getCurrentOperationType();
      // Auto-generate uses current operation type for routing
      addInputs({ assets: [asset], operationType: currentOperationType });
      selectAssetFromSummary(asset);
      openGenerationWidget(currentOperationType);
    },
    [addInputs, getCurrentOperationType, selectAssetFromSummary, openGenerationWidget],
  );

  // Silent add - adds inputs without opening control center
  const queueSilentAdd = useCallback(
    (asset: AssetModel) => {
      const currentOperationType = getCurrentOperationType();
      // Silent add uses current operation type for routing
      addInputs({ assets: [asset], operationType: currentOperationType });
      selectAssetFromSummary(asset);
      // Don't open control center - just add inputs
    },
    [addInputs, getCurrentOperationType, selectAssetFromSummary],
  );

  // Quick generate - delegates to the controller's generateWithAsset method
  // which uses the full generation pipeline (provider resolution, param building, etc.)
  // When count > 1, triggers burst mode (multiple generations).
  // Optional duration override from gesture secondary axis.
  const quickGenerate = useCallback(
    async (asset: AssetModel, options?: { addToQueue?: boolean; count?: number; duration?: number }) => {
      const widget = getWidgetContext();
      const currentOperationType = widget?.operationType ?? sessionOperationType;
      // Optionally add to inputs (default: no)
      if (options?.addToQueue) {
        addInputs({ assets: [asset], operationType: currentOperationType });
        selectAssetFromSummary(asset);
      }

      if (!widget?.generateWithAsset) {
        useToastStore.getState().addToast({
          type: 'error',
          message: 'No generation widget available for quick generate',
          duration: 4000,
        });
        return;
      }

      try {
        await widget.generateWithAsset(asset, options?.count, { duration: options?.duration });
      } catch (err) {
        useToastStore.getState().addToast({
          type: 'error',
          message: `Quick generate failed: ${extractErrorMessage(err)}`,
          duration: 4000,
        });
      }
    },
    [addInputs, getWidgetContext, sessionOperationType, selectAssetFromSummary],
  );

  // Upgrade model — re-queue generation with one model tier up.
  // Delegates to standalone upgradeModelForAsset() for shared logic with context menu.
  const upgradeModel = useCallback(
    async (asset: AssetModel) => {
      try {
        const result = await upgradeModelForAsset(asset, getCurrentOperationType());
        useToastStore.getState().addToast({
          type: result.type,
          message: result.message,
          duration: result.ok ? 3000 : 4000,
        });
      } catch (err) {
        useToastStore.getState().addToast({
          type: 'error',
          message: `Upgrade failed: ${extractErrorMessage(err)}`,
          duration: 4000,
        });
      }
    },
    [getCurrentOperationType],
  );

  // Patch asset — open quickgen widget pre-filled with asset's generation context.
  // Delegates to standalone patchAssetToWidget() for shared logic with context menu.
  const patchAsset = useCallback(
    async (asset: AssetModel) => {
      const widget = getWidgetContext();
      if (!widget) {
        useToastStore.getState().addToast({
          type: 'warning',
          message: 'No generation widget available',
          duration: 4000,
        });
        return;
      }
      try {
        await patchAssetToWidget(asset, getCurrentOperationType(), {
          widget,
          scopeId: scopedScopeId,
        });
      } catch (err) {
        useToastStore.getState().addToast({
          type: 'error',
          message: `Patch failed: ${extractErrorMessage(err)}`,
          duration: 4000,
        });
      }
    },
    [getCurrentOperationType, getWidgetContext, scopedScopeId],
  );

  return {
    queueImageToImage,
    queueImageToVideo,
    queueVideoExtend,
    queueAddToTransition,
    queueAutoGenerate,
    queueSilentAdd,
    quickGenerate,
    upgradeModel,
    patchAsset,
  };
}
