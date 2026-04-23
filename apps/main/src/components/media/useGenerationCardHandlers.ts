 
/**
 * Custom hook that extracts all generation-related callback handlers and
 * loading states from the GenerationButtonGroupContent component.
 */

import { useToastStore } from '@pixsim7/shared.ui';
import { useState, useCallback } from 'react';

import { extractFrame, getAsset, getAssetGenerationContext } from '@lib/api/assets';
import { searchBlocks } from '@lib/api/blockTemplates';
import { extractErrorMessage } from '@lib/api/errorHandling';

import { fromAssetResponse, toSelectedAsset, type AssetModel } from '@features/assets';
import {
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  getGenerationSessionStore,
  getGenerationSettingsStore,
  getGenerationInputStore,
} from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import { buildCompositionAssetsFromAssetIds, buildGenerationRequest } from '@features/generation/lib/quickGenerateLogic';
import { createGenerationRunDescriptor, createGenerationRunItemContext } from '@features/generation/lib/runContext';
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

/** Selects which video frame to extract for an artificial i2v-extend. */
export type ArtificialExtendFrameSelector =
  | { mode: 'last' }
  | { mode: 'first' }
  | { mode: 'timestamp'; seconds: number };

/** Options for an artificial-extend invocation. */
export interface ArtificialExtendOptions {
  /** Which frame to extract. Defaults to last. */
  selector?: ArtificialExtendFrameSelector;
  /**
   * Whose prompt to use: the source video's original generation prompt
   * ('same') or the one currently in the generation widget ('active').
   * Defaults to 'same'.
   */
  promptSource?: 'same' | 'active';
}

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
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
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

        // Prefer the actual widget scope when available so "Load to Quick Gen"
        // hydrates the visible widget, not a nearby media-card-local scope.
        const targetScopeId = widgetContext?.scopeId ?? scopedScopeId;
        const sessionStore = targetScopeId
          ? getGenerationSessionStore(targetScopeId).getState()
          : (useSessionStore as any).getState();
        const settingsStore = targetScopeId
          ? getGenerationSettingsStore(targetScopeId).getState()
          : (useSettingsStore as any).getState();
        const inputStore = targetScopeId
          ? getGenerationInputStore(targetScopeId).getState()
          : (useInputStore as any).getState();

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
      [widgetContext, scopedScopeId, useSessionStore, useSettingsStore, useInputStore],
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
      const run = createGenerationRunDescriptor({
        mode: 'media_card_direct',
        metadata: {
          source: 'useGenerationCardHandlers.submitDirectGeneration',
          operation_type: effectiveOperationType,
        },
      });

      const result = await generateAsset({
        prompt,
        providerId,
        operationType: effectiveOperationType,
        extraParams: params,
        runContext: createGenerationRunItemContext(run, {
          itemIndex: 0,
          itemTotal: 1,
        }),
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

  // Quick generate: delegates to the controller's pipeline directly,
  // bypassing widget state management (no flash on Go button).
  const handleQuickGenerate = useCallback(async () => {
    if (isQuickGenerating || !widgetContext?.executeGeneration) return;
    setIsQuickGenerating(true);
    try {
      await widgetContext.executeGeneration({ assetOverrides: [inputAsset] });
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

  const handleLoadToQuickGen = useCallback(async (options?: { withoutSeed?: boolean }) => {
    if ((!data.sourceGenerationId && !data.hasGenerationContext) || isLoadingSource) return;

    setIsLoadingSource(true);

    try {
      const withoutSeed = options?.withoutSeed === true;
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
      const paramsForWidget = withoutSeed
        ? stripSeedFromParams(sourceParams)
        : sourceParams;

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
        dynamicParams: stripInputParams(paramsForWidget),
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

      const buildResult = await buildGenerationRequest({
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

  // Artificial video extend: extract any frame and launch image_to_video
  // carrying the original prompt/params. Frame selector defaults to 'last'
  // but any video frame works — timestamp selects an arbitrary point,
  // 'first' shortcuts to t=0. Tagged on the resulting asset's
  // generation_context via the frame-mode-agnostic `artificial_extend`
  // marker (method: 'i2v_extracted_frame').
  const handleArtificialExtend = useCallback(async (
    options: ArtificialExtendOptions = {},
  ) => {
    const selector = options.selector ?? { mode: 'last' };
    const promptSource = options.promptSource ?? 'same';
    if (isExtending || mediaType !== 'video') return;
    if (promptSource === 'same' && !data.sourceGenerationId && !data.hasGenerationContext) return;

    setIsExtending(true);

    try {
      const ctx = await getAssetGenerationContext(id);
      const { params: originalParams, providerId, prompt: originalPrompt } = parseGenerationContext(ctx, operationType);

      // Resolve prompt from chosen source
      let prompt = originalPrompt;
      if (promptSource === 'active') {
        const scopeId = widgetContext?.scopeId ?? scopedScopeId ?? 'global';
        prompt = getGenerationSessionStore(scopeId).getState().prompt || '';
      }

      const frameRequest =
        selector.mode === 'last'
          ? { video_asset_id: id, last_frame: true }
          : selector.mode === 'first'
            ? { video_asset_id: id, timestamp: 0 }
            : { video_asset_id: id, timestamp: selector.seconds };

      const frameResponse = await extractFrame(frameRequest);
      const frameAsset = fromAssetResponse(frameResponse);

      const baseParams = stripInputParams(originalParams as Record<string, unknown>);
      const opSpec = providerCapabilityRegistry.getOperationSpec(providerId ?? '', 'image_to_video');
      const maxChars = resolvePromptLimitFromSpec(
        providerId,
        baseParams?.model as string | undefined,
        opSpec,
      );

      const currentInput = {
        id: `card-${frameAsset.id}`,
        asset: frameAsset,
        queuedAt: new Date().toISOString(),
        lockedTimestamp: undefined,
      };

      const buildResult = await buildGenerationRequest({
        operationType: 'image_to_video',
        prompt: prompt || '',
        dynamicParams: baseParams,
        operationInputs: [currentInput],
        prompts: [],
        transitionDurations: [],
        maxChars,
        activeAsset: toSelectedAsset(frameAsset, 'gallery'),
        currentInput,
      });

      if (buildResult.error || !buildResult.params) {
        useToastStore.getState().addToast({
          type: 'error',
          message: buildResult.error || 'Failed to build artificial extend request.',
          duration: 4000,
        });
        return;
      }

      const frameMarker: Record<string, unknown> =
        selector.mode === 'timestamp'
          ? { mode: 'timestamp', timestamp_sec: selector.seconds }
          : { mode: selector.mode };

      const submitParams: Record<string, unknown> = {
        ...buildResult.params,
        artificial_extend: {
          source_video_id: id,
          source_frame_asset_id: frameAsset.id,
          method: 'i2v_extracted_frame',
          frame: frameMarker,
        },
      };

      const successLabel =
        selector.mode === 'last'
          ? 'last frame'
          : selector.mode === 'first'
            ? 'first frame'
            : `frame @ ${selector.seconds.toFixed(2)}s`;

      const promptLabel = promptSource === 'active' ? ' (active prompt)' : '';
      await submitDirectGeneration({
        operationType: 'image_to_video',
        providerId,
        prompt: buildResult.finalPrompt,
        params: submitParams,
        successMessage: `Extending video from ${successLabel}${promptLabel}...`,
      });
    } catch (error) {
      console.error('Failed to artificially extend video:', error);
      const raw = extractErrorMessage(error);
      const lower = raw.toLowerCase();
      const isModerationReject =
        lower.includes('not compliant')
        || lower.includes('content policy')
        || lower.includes('moderation')
        || lower.includes('content filtered');
      const message = isModerationReject
        ? 'The source video has no reusable last frame (Pixverse filtered the generation). Try a different source, or use native extend instead.'
        : `Failed to extend: ${raw}`;
      useToastStore.getState().addToast({
        type: 'error',
        message,
        duration: isModerationReject ? 6000 : 4000,
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
    widgetContext?.scopeId,
    scopedScopeId,
    submitDirectGeneration,
  ]);

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

      // Ensure composition_assets is present for operations that require it.
      // The canonical_params from generation-context are flat provider params
      // and may not include composition_assets (e.g. legacy generations).
      if (!sourceParams.composition_assets && sourceAssetIds.length > 0) {
        const built = buildCompositionAssetsFromAssetIds(resolvedOperationType, sourceAssetIds);
        if (built) {
          sourceParams.composition_assets = built;
        }
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

  /**
   * Generate style variations: re-run the same generation with different
   * style primitive texts appended to the original prompt.
   *
   * @param category - style primitive category to sweep (default: aesthetic_preset)
   * @param blockIds - optional subset of block_ids; when omitted, all blocks in the category are used
   */
  const handleGenerateStyleVariations = useCallback(
    async (category = 'aesthetic_preset', blockIds?: string[]) => {
      if ((!data.sourceGenerationId && !data.hasGenerationContext) || isGeneratingVariations) return;

      setIsGeneratingVariations(true);
      try {
        const ctx = await getAssetGenerationContext(id);
        const {
          params,
          operationType: resolvedOperationType,
          providerId,
          prompt,
          sourceAssetIds,
        } = parseGenerationContext(ctx, operationType);

        const sourceParams = stripSeedFromParams(params as Record<string, unknown>);

        // Preserve source asset references (same logic as handleRegenerate)
        if (
          sourceAssetIds.length > 0
          && !sourceParams.source_asset_ids
          && !sourceParams.sourceAssetIds
          && !sourceParams.source_asset_id
          && !sourceParams.sourceAssetId
        ) {
          sourceParams.source_asset_ids = sourceAssetIds;
        }
        if (!sourceParams.composition_assets && sourceAssetIds.length > 0) {
          const built = buildCompositionAssetsFromAssetIds(resolvedOperationType, sourceAssetIds);
          if (built) {
            sourceParams.composition_assets = built;
          }
        }

        // Fetch style primitives for the requested category
        const blocks = await searchBlocks({ category, limit: 20 });
        const selectedBlocks = blockIds
          ? blocks.filter((b) => blockIds.includes(b.block_id))
          : blocks;

        if (selectedBlocks.length === 0) {
          useToastStore.getState().addToast({
            type: 'info',
            message: 'No style primitives found for this category.',
            duration: 3000,
          });
          return;
        }

        const run = createGenerationRunDescriptor({
          mode: 'style_variations',
          metadata: {
            source: 'useGenerationCardHandlers.styleVariations',
            category,
            source_asset_id: id,
          },
        });

        // Submit one generation per style block
        for (let i = 0; i < selectedBlocks.length; i++) {
          const block = selectedBlocks[i];
          const variantPrompt = `${prompt}\n\n${block.text}`;
          const variantParams = { ...sourceParams, seed: nextRandomGenerationSeed() };

          const result = await generateAsset({
            prompt: variantPrompt,
            providerId,
            operationType: resolvedOperationType,
            extraParams: variantParams,
            runContext: createGenerationRunItemContext(run, {
              itemIndex: i,
              itemTotal: selectedBlocks.length,
            }),
          });

          addOrUpdateGeneration(createPendingGeneration({
            id: result.job_id,
            operationType: resolvedOperationType,
            providerId,
            finalPrompt: variantPrompt,
            params: variantParams,
            status: result.status || 'pending',
          }));

          setWatchingGeneration(result.job_id);
        }

        useToastStore.getState().addToast({
          type: 'success',
          message: `Generating ${selectedBlocks.length} style variation${selectedBlocks.length === 1 ? '' : 's'}...`,
          duration: 3000,
        });
      } catch (error) {
        console.error('Failed to generate style variations:', error);
        useToastStore.getState().addToast({
          type: 'error',
          message: `Failed to generate style variations: ${extractErrorMessage(error)}`,
          duration: 4000,
        });
      } finally {
        setIsGeneratingVariations(false);
      }
    },
    [
      id,
      data.sourceGenerationId,
      data.hasGenerationContext,
      isGeneratingVariations,
      operationType,
      addOrUpdateGeneration,
      setWatchingGeneration,
    ],
  );

  return {
    isQuickGenerating,
    isLoadingSource,
    isExtending,
    isRegenerating,
    isGeneratingVariations,
    isInsertingPrompt,
    handleQuickGenerate,
    handleLoadToQuickGen,
    handleInsertPromptOnly,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    handleArtificialExtend,
    handleRegenerate,
    handleGenerateStyleVariations,
    hydrateWidgetGenerationState,
  };
}
