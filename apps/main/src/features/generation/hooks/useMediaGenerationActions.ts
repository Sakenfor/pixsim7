import { useCallback, useMemo } from 'react';
import type { AssetModel } from '@features/assets';
import { toSelectedAsset } from '@features/assets/models/asset';
import { useGenerationQueueStore } from '../stores/generationQueueStore';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { useAssetSelectionStore } from '@features/assets/stores/assetSelectionStore';
import { useGenerationScopeStores } from './useGenerationScope';
import { useGenerationsStore } from '../stores/generationsStore';
import { createPendingGeneration } from '../models';
import { buildGenerationRequest } from '@features/prompts/lib/quickGenerateLogic';
import { generateAsset } from '@features/controlCenter/lib/api';
import { normalizeAssetParams } from '../lib/core';
import { extractErrorMessage } from '@lib/api/errorHandling';
import type { OperationType } from '@/types/operations';

/**
 * Hook: useMediaGenerationActions
 *
 * Centralizes gallery → generation actions so MediaCard and widgets
 * can queue work and open the Control Center consistently.
 *
 * Uses the centralized `enqueueAsset` API for automatic queue routing
 * based on operation metadata and user preferences.
 *
 * Scope-aware: Uses useGenerationScopeStores() to read from the current
 * generation scope (panel-local or global). This allows quick actions
 * to use the appropriate settings context.
 *
 * When assets are added via quick actions:
 * - The asset is added to the appropriate generation queue (auto-routed)
 * - The asset is selected in the asset selection store
 * - The Control Center operation type is set to match
 * - The Quick Generate module is opened
 */
export function useMediaGenerationActions() {
  const enqueueAsset = useGenerationQueueStore((s) => s.enqueueAsset);

  // Use scoped stores for scope-aware generation settings
  const { useSessionStore, useSettingsStore } = useGenerationScopeStores();

  // Control center actions (for opening UI)
  const setActiveModule = useControlCenterStore((s) => s.setActiveModule);
  const setOpen = useControlCenterStore((s) => s.setOpen);
  const setOperationType = useControlCenterStore((s) => s.setOperationType);

  // Read operation type from scoped session store
  const currentOperationType = useSessionStore((s) => s.operationType);

  const selectAsset = useAssetSelectionStore((s) => s.selectAsset);

  const openQuickGenerate = useCallback(() => {
    setActiveModule('quickGenerate');
    setOpen(true);
  }, [setActiveModule, setOpen]);

  // Helper to select asset in selection store
  const selectAssetFromSummary = useCallback((asset: AssetModel) => {
    selectAsset(toSelectedAsset(asset, 'gallery'));
  }, [selectAsset]);

  // Smart queue action - automatically routes to main or multi-asset queue via enqueueAsset
  const createQueueAction = useCallback(
    (operationType: OperationType) => (asset: AssetModel) => {
      // Use centralized enqueueAsset which handles queue routing automatically
      enqueueAsset({ asset, operationType });

      selectAssetFromSummary(asset);

      // Only set operation type if it's different to avoid resetting settings
      if (currentOperationType !== operationType) {
        setOperationType(operationType);
      }

      openQuickGenerate();
    },
    [enqueueAsset, selectAssetFromSummary, setOperationType, currentOperationType, openQuickGenerate],
  );

  // Memoize individual actions for stable references
  const queueImageToImage = useMemo(() => createQueueAction('image_to_image'), [createQueueAction]);
  const queueImageToVideo = useMemo(() => createQueueAction('image_to_video'), [createQueueAction]);
  const queueVideoExtend = useMemo(() => createQueueAction('video_extend'), [createQueueAction]);
  const queueAddToTransition = useMemo(() => createQueueAction('video_transition'), [createQueueAction]);

  const queueAutoGenerate = useCallback(
    (asset: AssetModel) => {
      // Auto-generate uses current operation type for routing
      enqueueAsset({ asset, operationType: currentOperationType });
      selectAssetFromSummary(asset);
      openQuickGenerate();
    },
    [enqueueAsset, currentOperationType, selectAssetFromSummary, openQuickGenerate],
  );

  // Silent add - just adds to queue without opening control center
  const queueSilentAdd = useCallback(
    (asset: AssetModel) => {
      // Silent add uses current operation type for routing
      enqueueAsset({ asset, operationType: currentOperationType });
      selectAssetFromSummary(asset);
      // Don't open control center - just queue it
    },
    [enqueueAsset, currentOperationType, selectAssetFromSummary],
  );

  // Generations store for seeding new generations
  const addOrUpdateGeneration = useGenerationsStore((s) => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore((s) => s.setWatchingGeneration);

  // Quick generate - immediately triggers generation with an asset
  // Uses current scoped settings (provider, model, params, etc.)
  // Does NOT add to queue - just generates directly
  const quickGenerate = useCallback(
    async (asset: AssetModel, options?: { addToQueue?: boolean }) => {
      try {
        // Optionally add to queue (default: no)
        if (options?.addToQueue) {
          enqueueAsset({ asset, operationType: currentOperationType });
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
          mainQueueCurrent: { asset, lockedTimestamp: undefined },
        });

        if (buildResult.error || !buildResult.params) {
          console.error('[quickGenerate] Build failed:', buildResult.error);
          return;
        }

        // Normalize params and call generate API
        const normalizedParams = normalizeAssetParams(buildResult.params);

        const result = await generateAsset({
          prompt: buildResult.finalPrompt,
          providerId,
          presetId,
          operationType,
          extraParams: normalizedParams,
          presetParams: presetParams || {},
        });

        // Seed the generations store
        const genId = result.job_id;

        addOrUpdateGeneration(createPendingGeneration({
          id: genId,
          operationType,
          providerId,
          finalPrompt: buildResult.finalPrompt,
          params: normalizedParams,
          status: result.status || 'pending',
        }));

        setWatchingGeneration(genId);

        console.debug('[quickGenerate] Started generation:', genId);
      } catch (err) {
        console.error('[quickGenerate] Failed:', extractErrorMessage(err));
      }
    },
    [
      enqueueAsset,
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
