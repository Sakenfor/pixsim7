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
import type { InputItem } from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import { buildGenerationRequest } from '@features/generation/lib/quickGenerateLogic';
import { providerCapabilityRegistry } from '@features/providers';

import { getFallbackOperation, type OperationType } from '@/types/operations';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';

import { createPendingGeneration } from '../models';
import {
  getGenerationSessionStore,
  getGenerationSettingsStore,
} from '../stores/generationScopeStores';
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
  // Uses the active generation widget's settings (provider, model, params, etc.)
  // Falls back to local scope stores if no widget is active.
  // Mirrors the controller.generate() flow but with the clicked asset as sole input
  const quickGenerate = useCallback(
    async (asset: AssetModel, options?: { addToQueue?: boolean }) => {
      try {
        // Optionally add to inputs (default: no)
        if (options?.addToQueue) {
          addInputs({ assets: [asset], operationType: currentOperationType });
          selectAssetFromSummary(asset);
        }

        // Read from the active generation widget's scope (e.g. control center)
        // so quick generate respects provider/account/settings the user sees.
        // Falls back to local scope if no widget is active.
        const widgetScopeId = widgetContext?.scopeId;
        const resolvedSessionStore = widgetScopeId
          ? getGenerationSessionStore(widgetScopeId)
          : useSessionStore;
        const resolvedSettingsStore = widgetScopeId
          ? getGenerationSettingsStore(widgetScopeId)
          : useSettingsStore;
        const sessionState = (resolvedSessionStore as any).getState();
        const settingsState = (resolvedSettingsStore as any).getState();

        const { operationType, prompt, providerId: storeProviderId } = sessionState;
        const dynamicParams = settingsState.params || {};
        // Resolve provider from model when session store doesn't have an explicit one
        const modelProviderId = dynamicParams.model
          ? providerCapabilityRegistry.getProviderIdForModel(dynamicParams.model as string)
          : undefined;
        const providerId = storeProviderId ?? modelProviderId;
        console.log('[quickGenerate] scopeId=%s provider=%s preferred_account_id=%s', widgetScopeId ?? 'local', providerId, dynamicParams.preferred_account_id ?? 'auto');
        const opSpec = providerCapabilityRegistry.getOperationSpec(providerId ?? '', operationType);
        const maxChars = resolvePromptLimitForModel(
          providerId,
          dynamicParams?.model as string | undefined,
          opSpec?.parameters,
        );

        // Create a proper InputItem for the asset (mirrors what the input store creates)
        const inputItem: InputItem = {
          id: `quick-${asset.id}-${Date.now()}`,
          asset,
          queuedAt: new Date().toISOString(),
          lockedTimestamp: undefined,
        };

        // Build the generation request with the asset as the sole input.
        // Pass it both as operationInputs (for multi-asset resolution like
        // composition_assets) and as currentInput (for single-asset resolution
        // like source_asset_id). Don't manually inject source_asset_id — let
        // buildGenerationRequest resolve it through its normal chain.
        const buildResult = buildGenerationRequest({
          operationType,
          prompt: prompt || '',
          dynamicParams,
          operationInputs: [inputItem],
          prompts: [],
          transitionDurations: [],
          maxChars,
          activeAsset: toSelectedAsset(asset, 'gallery'),
          currentInput: inputItem,
        });

        if (buildResult.error || !buildResult.params) {
          useToastStore.getState().addToast({
            type: 'error',
            message: buildResult.error ?? 'Failed to build generation request',
            duration: 4000,
          });
          return;
        }

        // Use getFallbackOperation like the controller does
        const hasAssetInput =
          Array.isArray(buildResult.params.composition_assets) &&
          buildResult.params.composition_assets.length > 0;
        const effectiveOperationType = getFallbackOperation(operationType, hasAssetInput);

        const result = await generateAsset({
          prompt: buildResult.finalPrompt,
          providerId,
          operationType: effectiveOperationType,
          extraParams: buildResult.params,
        });

        // Seed the generations store
        const genId = result.job_id;

        addOrUpdateGeneration(createPendingGeneration({
          id: genId,
          operationType: effectiveOperationType,
          providerId,
          finalPrompt: buildResult.finalPrompt,
          params: buildResult.params,
          status: result.status || 'pending',
        }));

        setWatchingGeneration(genId);
      } catch (err) {
        useToastStore.getState().addToast({
          type: 'error',
          message: `Quick generate failed: ${extractErrorMessage(err)}`,
          duration: 4000,
        });
      }
    },
    [
      addInputs,
      currentOperationType,
      selectAssetFromSummary,
      widgetContext,
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
