 
/**
 * Custom hook that extracts all generation-related callback handlers and
 * loading states from the GenerationButtonGroupContent component.
 */

import { useToastStore } from '@pixsim7/shared.ui';
import { useState, useCallback } from 'react';

import { getAsset, getAssetGenerationContext } from '@lib/api/assets';
import { extractErrorMessage } from '@lib/api/errorHandling';

import { fromAssetResponse, toSelectedAsset, type AssetModel } from '@features/assets';
import {
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  getGenerationSessionStore,
} from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import { buildGenerationRequest } from '@features/generation/lib/quickGenerateLogic';
import { nextRandomGenerationSeed } from '@features/generation/lib/seed';
import { createPendingGeneration } from '@features/generation/models';
import { useGenerationsStore } from '@features/generation/stores/generationsStore';
import { providerCapabilityRegistry } from '@features/providers';

import type { OperationType } from '@/types/operations';
import { getFallbackOperation } from '@/types/operations';


import {
  hasAssetInputs,
  resolvePromptLimitFromSpec,
  stripSeedFromParams,
  paramsIncludeSeed,
  operationSupportsSeedParam,
} from './mediaCardGeneration.helpers';
import { stripInputParams, parseGenerationContext } from './mediaCardGeneration.utils';
import type { MediaCardOverlayData } from './mediaCardWidgets';

export interface UseGenerationCardHandlersArgs {
  inputAsset: AssetModel;
  operationType: OperationType;
  /** Zustand hook for generation session store (scoped) */
  useSessionStore: any;
  /** Zustand hook for generation settings store (scoped) */
  useSettingsStore: any;
  /** Zustand hook for generation input store (scoped) */
  useInputStore: any;
  widgetContext: GenerationWidgetContext | undefined;
  scopedScopeId: string | undefined;
  data: MediaCardOverlayData;
  id: number;
  mediaType: string;
}

export function useGenerationCardHandlers(args: UseGenerationCardHandlersArgs) {
  const {
    inputAsset,
    operationType,
    useSessionStore,
    useSettingsStore,
    useInputStore,
    widgetContext,
    scopedScopeId,
    data,
    id,
    mediaType,
  } = args;

  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isQuickGenerating, setIsQuickGenerating] = useState(false);
  const [isInsertingPrompt, setIsInsertingPrompt] = useState(false);

  // Get generations store for seeding new generations
  const addOrUpdateGeneration = useGenerationsStore((s) => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore((s) => s.setWatchingGeneration);

  const hydrateWidgetGenerationState = useCallback(
    async (options: {
      operationType: OperationType;
      providerId?: string;
      prompt: string;
      dynamicParams: Record<string, unknown>;
      assets?: AssetModel[];
      triggerGenerate?: boolean;
    }): Promise<boolean> => {
      const {
        operationType: nextOperationType,
        providerId,
        prompt,
        dynamicParams,
        assets = [],
        triggerGenerate = false,
      } = options;

      // Use the scoped stores directly — getGenerationSettingsStore('global')
      // creates a separate store from the singleton useGenerationSettingsStore,
      // so we must use the stores from scope context to read/write the correct state.
      const sessionStore = (useSessionStore as any).getState();
      const settingsStore = (useSettingsStore as any).getState();
      const inputStore = (useInputStore as any).getState();

      sessionStore.setOperationType(nextOperationType);
      widgetContext?.setOperationType?.(nextOperationType);

      if (providerId) {
        sessionStore.setProvider(providerId);
      }

      // Sync settings store's active operation type BEFORE setting params,
      // so setDynamicParams saves to the correct paramsPerOperation key.
      // Without this, the useEffect in useGenerationWorkbench that syncs
      // activeOperationType fires after render and overwrites our params
      // with stale/empty values for the new operation type.
      settingsStore.setActiveOperationType(nextOperationType);

      sessionStore.setPrompt(prompt);
      settingsStore.setDynamicParams(dynamicParams);
      inputStore.clearInputs(nextOperationType);

      if (assets.length > 0) {
        inputStore.addInputs({ assets, operationType: nextOperationType });
      }

      widgetContext?.setOpen(true);

      if (triggerGenerate && widgetContext?.generate) {
        await widgetContext.generate();
        return true;
      }

      return false;
    },
    [widgetContext, useSessionStore, useSettingsStore, useInputStore],
  );

  const submitDirectGeneration = useCallback(
    async (options: {
      operationType: OperationType;
      providerId?: string;
      prompt: string;
      params: Record<string, unknown>;
      successMessage: string;
    }) => {
      const { operationType: requestedOperationType, providerId, prompt, params, successMessage } = options;
      const hasAssetInput = hasAssetInputs(params);
      const effectiveOperationType = getFallbackOperation(requestedOperationType, hasAssetInput);

      const result = await generateAsset({
        prompt,
        providerId,
        operationType: effectiveOperationType,
        extraParams: params,
      });

      const genId = result.job_id;
      addOrUpdateGeneration(createPendingGeneration({
        id: genId,
        operationType: effectiveOperationType,
        providerId,
        finalPrompt: prompt,
        params,
        status: result.status || 'pending',
      }));

      setWatchingGeneration(genId);

      useToastStore.getState().addToast({
        type: 'success',
        message: successMessage,
        duration: 3000,
      });
    },
    [addOrUpdateGeneration, setWatchingGeneration],
  );

  // Quick generate: delegates to the controller's generateWithAsset method,
  // which uses the full generation pipeline (provider resolution, param building, etc.)
  const handleQuickGenerate = useCallback(async () => {
    if (isQuickGenerating || !widgetContext?.generateWithAsset) return;
    setIsQuickGenerating(true);
    try {
      await widgetContext.generateWithAsset(inputAsset);
    } catch (err) {
      useToastStore.getState().addToast({
        type: 'error',
        message: `Quick generate failed: ${extractErrorMessage(err)}`,
        duration: 4000,
      });
    } finally {
      setIsQuickGenerating(false);
    }
  }, [isQuickGenerating, widgetContext, inputAsset]);

  const handleLoadToQuickGen = useCallback(async () => {
    if ((!data.sourceGenerationId && !data.hasGenerationContext) || isLoadingSource) return;

    setIsLoadingSource(true);

    try {
      const ctx = await getAssetGenerationContext(id);
      const {
        params,
        operationType: resolvedOperationType,
        providerId,
        prompt,
        sourceAssetIds,
      } = parseGenerationContext(ctx, operationType);

      const sourceParams = (params && typeof params === 'object')
        ? (params as Record<string, unknown>)
        : {};

      // Resolve input assets from context's source_asset_ids
      let assets: AssetModel[] = [];
      if (sourceAssetIds.length > 0) {
        const results = await Promise.allSettled(sourceAssetIds.map((assetId) => getAsset(assetId)));
        assets = results
          .map((result) => (result.status === 'fulfilled' ? fromAssetResponse(result.value) : null))
          .filter((asset): asset is AssetModel => !!asset);
      }

      await hydrateWidgetGenerationState({
        operationType: resolvedOperationType,
        providerId,
        prompt,
        dynamicParams: stripInputParams(sourceParams),
        assets,
      });
    } catch (error) {
      console.error('Failed to load generation into Quick Generate:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: 'Failed to load generation settings.',
        duration: 4000,
      });
    } finally {
      setIsLoadingSource(false);
    }
  }, [
    id,
    data.sourceGenerationId,
    data.hasGenerationContext,
    isLoadingSource,
    operationType,
    hydrateWidgetGenerationState,
  ]);

  const handleInsertPromptOnly = useCallback(async () => {
    if ((!data.sourceGenerationId && !data.hasGenerationContext) || isInsertingPrompt) return;

    setIsInsertingPrompt(true);
    try {
      const ctx = await getAssetGenerationContext(id);
      const { prompt } = parseGenerationContext(ctx, operationType);

      const scopeId = widgetContext?.scopeId ?? scopedScopeId ?? 'global';
      const sessionStore = getGenerationSessionStore(scopeId).getState();
      sessionStore.setPrompt(prompt);

      widgetContext?.setOpen(true);
    } catch (error) {
      console.error('Failed to insert prompt:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: 'Failed to load prompt.',
        duration: 4000,
      });
    } finally {
      setIsInsertingPrompt(false);
    }
  }, [
    id,
    data.sourceGenerationId,
    data.hasGenerationContext,
    isInsertingPrompt,
    operationType,
    scopedScopeId,
    widgetContext,
  ]);

  // Handler for extending video with the same prompt
  const handleExtendVideo = useCallback(async (promptSource: 'same' | 'active') => {
    if (isExtending || mediaType !== 'video') return;
    if (promptSource === 'same' && !data.sourceGenerationId && !data.hasGenerationContext) return;

    setIsExtending(true);

    try {
      const ctx = await getAssetGenerationContext(id);
      const { params: originalParams, providerId, prompt: originalPrompt } = parseGenerationContext(ctx, operationType);

      // Use the active widget prompt or the original generation prompt
      let prompt = originalPrompt;
      if (promptSource === 'active') {
        const scopeId = widgetContext?.scopeId ?? scopedScopeId ?? 'global';
        prompt = getGenerationSessionStore(scopeId).getState().prompt || '';
      }

      const extendParams = {
        ...stripInputParams(originalParams as Record<string, unknown>),
        source_asset_id: id,
      };

      const opSpec = providerCapabilityRegistry.getOperationSpec(providerId ?? '', 'video_extend');
      const maxChars = resolvePromptLimitFromSpec(
        providerId,
        extendParams?.model as string | undefined,
        opSpec,
      );

      const buildResult = buildGenerationRequest({
        operationType: 'video_extend',
        prompt: prompt || '',
        dynamicParams: extendParams,
        operationInputs: [{
          id: `card-${id}`,
          asset: inputAsset,
          queuedAt: new Date().toISOString(),
          lockedTimestamp: undefined,
        }],
        prompts: [],
        transitionDurations: [],
        maxChars,
        activeAsset: toSelectedAsset(inputAsset, 'gallery'),
        currentInput: {
          id: `card-${id}`,
          asset: inputAsset,
          queuedAt: new Date().toISOString(),
          lockedTimestamp: undefined,
        },
      });

      if (buildResult.error || !buildResult.params) {
        useToastStore.getState().addToast({
          type: 'error',
          message: buildResult.error || 'Failed to build extend request.',
          duration: 4000,
        });
        return;
      }

      const extendSubmitParams = { ...buildResult.params };
      const originalVideoId =
        extendSubmitParams.original_video_id ?? extendSubmitParams.originalVideoId;
      if (originalVideoId !== undefined && originalVideoId !== null && `${originalVideoId}`.trim() !== '') {
        delete extendSubmitParams.video_url;
        delete extendSubmitParams.videoUrl;
      }

      await submitDirectGeneration({
        operationType: 'video_extend',
        providerId,
        prompt: buildResult.finalPrompt,
        params: extendSubmitParams,
        successMessage: promptSource === 'active' ? 'Extending video with active prompt...' : 'Extending video...',
      });
    } catch (error) {
      console.error('Failed to extend video:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: `Failed to extend video: ${extractErrorMessage(error)}`,
        duration: 4000,
      });
    } finally {
      setIsExtending(false);
    }
  }, [
    data.sourceGenerationId,
    data.hasGenerationContext,
    isExtending,
    mediaType,
    operationType,
    id,
    inputAsset,
    widgetContext?.scopeId,
    scopedScopeId,
    submitDirectGeneration,
  ]);

  const handleExtendWithSamePrompt = useCallback(() => handleExtendVideo('same'), [handleExtendVideo]);
  const handleExtendWithActivePrompt = useCallback(() => handleExtendVideo('active'), [handleExtendVideo]);

  // Handler for regenerating (re-run the exact same generation)
  const handleRegenerate = useCallback(async () => {
    if ((!data.sourceGenerationId && !data.hasGenerationContext) || isRegenerating) return;

    setIsRegenerating(true);

    try {
      // Fetch generation context (from record or metadata)
      const ctx = await getAssetGenerationContext(id);
      const {
        params,
        operationType: resolvedOperationType,
        providerId,
        prompt,
        sourceAssetIds,
      } = parseGenerationContext(ctx, operationType);

      const sourceParams = stripSeedFromParams(params as Record<string, unknown>);

      // Ensure source asset references are present in params so the backend
      // receives the correct operation type (e.g. image_to_video stays i2v
      // instead of falling back to text_to_video).
      if (
        sourceAssetIds.length > 0
        && !sourceParams.source_asset_ids
        && !sourceParams.sourceAssetIds
        && !sourceParams.source_asset_id
        && !sourceParams.sourceAssetId
      ) {
        sourceParams.source_asset_ids = sourceAssetIds;
      }
      const parsedParams = params as Record<string, unknown>;
      const shouldRandomizeSeed =
        paramsIncludeSeed(parsedParams)
        || await operationSupportsSeedParam(providerId, resolvedOperationType);
      if (shouldRandomizeSeed) {
        sourceParams.seed = nextRandomGenerationSeed();
      }
      await submitDirectGeneration({
        operationType: resolvedOperationType,
        providerId,
        prompt,
        params: sourceParams,
        successMessage: 'Regenerating...',
      });
    } catch (error) {
      console.error('Failed to regenerate:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: `Failed to regenerate: ${extractErrorMessage(error)}`,
        duration: 4000,
      });
    } finally {
      setIsRegenerating(false);
    }
  }, [
    id,
    data.sourceGenerationId,
    data.hasGenerationContext,
    isRegenerating,
    operationType,
    submitDirectGeneration,
  ]);

  return {
    isQuickGenerating,
    isLoadingSource,
    isExtending,
    isRegenerating,
    isInsertingPrompt,
    handleQuickGenerate,
    handleLoadToQuickGen,
    handleInsertPromptOnly,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    handleRegenerate,
    hydrateWidgetGenerationState,
  };
}
