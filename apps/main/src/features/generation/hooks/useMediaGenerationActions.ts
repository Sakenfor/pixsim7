import { useCallback, useMemo } from 'react';

import { extractErrorMessage } from '@lib/api/errorHandling';

import type { AssetModel } from '@features/assets';
import { toSelectedAsset } from '@features/assets/models/asset';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import {
  CAP_GENERATION_WIDGET,
  type GenerationWidgetContext,
  useCapability,
} from '@features/contextHub';
import { generateAsset } from '@features/controlCenter/lib/api';
import { buildGenerationRequest } from '@features/generation/lib/quickGenerateLogic';

import type { OperationType } from '@/types/operations';

import { createPendingGeneration } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

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
  const { useSessionStore, useSettingsStore, useInputStore } = useGenerationScopeStores();
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

  // Generations store for seeding new generations
  const addOrUpdateGeneration = useGenerationsStore((s) => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore((s) => s.setWatchingGeneration);

  // Quick generate - immediately triggers generation with an asset
  // Uses current scoped settings (provider, model, params, etc.)
  // Does NOT add to inputs - just generates directly
  const quickGenerate = useCallback(
    async (asset: AssetModel, options?: { addToQueue?: boolean }) => {
      try {
        // Optionally add to inputs (default: no)
        if (options?.addToQueue) {
          addInputs({ assets: [asset], operationType: currentOperationType });
          selectAssetFromSummary(asset);
        }

        // Read current state from scoped stores
        // Using getState() to get fresh values in the callback
        const sessionState = (useSessionStore as any).getState();
        const settingsState = (useSettingsStore as any).getState();

        const { operationType, prompt, providerId, presetId, presetParams } = sessionState;
        const dynamicParams = settingsState.params || {};

        // Build the generation request with the asset as source
        const buildResult = buildGenerationRequest({
          operationType,
          prompt: prompt || '',
          presetParams: presetParams || {},
          dynamicParams: {
            ...dynamicParams,
            source_asset_id: asset.id,
          },
          sourceAssetIds: undefined,
          prompts: [],
          transitionDurations: [],
          activeAsset: {
            id: asset.id,
            type: asset.mediaType,
            source: 'gallery',
          },
          currentInput: { id: 'quick', asset, queuedAt: '', lockedTimestamp: undefined },
        });

        if (buildResult.error || !buildResult.params) {
          console.error('[quickGenerate] Build failed:', buildResult.error);
          return;
        }

        const result = await generateAsset({
          prompt: buildResult.finalPrompt,
          providerId,
          presetId,
          operationType,
          extraParams: buildResult.params,
          presetParams: presetParams || {},
        });

        // Seed the generations store
        const genId = result.job_id;

        addOrUpdateGeneration(createPendingGeneration({
          id: genId,
          operationType,
          providerId,
          finalPrompt: buildResult.finalPrompt,
          params: buildResult.params,
          status: result.status || 'pending',
        }));

        setWatchingGeneration(genId);

        console.debug('[quickGenerate] Started generation:', genId);
      } catch (err) {
        console.error('[quickGenerate] Failed:', extractErrorMessage(err));
      }
    },
    [
      addInputs,
      currentOperationType,
      selectAssetFromSummary,
      useSessionStore,
      useSettingsStore,
      addOrUpdateGeneration,
      setWatchingGeneration,
    ],
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
