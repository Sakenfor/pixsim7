 
/**
 * Custom hook that extracts all generation-related callback handlers and
 * loading states from the GenerationButtonGroupContent component.
 */

import { useToastStore } from '@pixsim7/shared.ui';
import { useState, useCallback, useRef } from 'react';

import { extractFrame, getAssetGenerationContext } from '@lib/api/assets';
import { searchBlocks } from '@lib/api/blockTemplates';
import { extractErrorMessage } from '@lib/api/errorHandling';

import { fromAssetResponse, toSelectedAsset, type AssetModel } from '@features/assets';
import { loadToQuickGenDescriptor } from '@features/assets/actions';
import {
  type GenerateOverrides,
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  getGenerationSessionStore,
  useQuickGenStagingStore,
} from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import {
  insertAssetsToQuickGen,
  insertPromptToQuickGen,
  insertSeedToQuickGen,
} from '@features/generation/lib/assetGenerationActions';
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

function parseSeedValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return undefined;
}

function toParamsRecord(params: unknown): Record<string, unknown> {
  return (params && typeof params === 'object')
    ? (params as Record<string, unknown>)
    : {};
}

function extractSeedFromParams(params: unknown): number | undefined {
  return parseSeedValue(toParamsRecord(params).seed);
}

/**
 * Ensure a regenerate/style-variation param blob carries the source
 * generation's input assets. canonical_params from generation-context is a
 * flat provider-param shape and may omit asset references (especially legacy
 * generations), so we backfill `source_asset_ids` (keeps the operation type
 * from falling back to text-to-*) and rebuild `composition_assets` when the
 * operation needs them. Mutates and returns `params`.
 */
function ensureSourceAssetParams(
  params: Record<string, unknown>,
  operationType: OperationType,
  sourceAssetIds: number[],
): Record<string, unknown> {
  if (sourceAssetIds.length === 0) return params;

  if (
    !params.source_asset_ids
    && !params.sourceAssetIds
    && !params.source_asset_id
    && !params.sourceAssetId
  ) {
    params.source_asset_ids = sourceAssetIds;
  }

  if (!params.composition_assets) {
    const built = buildCompositionAssetsFromAssetIds(operationType, sourceAssetIds);
    if (built) {
      params.composition_assets = built;
    }
  }

  return params;
}

export function useGenerationCardHandlers(args: UseGenerationCardHandlersArgs) {
  const {
    inputAsset,
    operationType,
    widgetContext,
    scopedScopeId,
    data,
    id,
    mediaType,
  } = args;

  // Whether this asset carries a source generation we can re-run / mine for
  // prompt, seed, or inputs. Gate shared by every regenerate/extend/insert
  // handler below.
  const hasSourceContext = !!(data.sourceGenerationId || data.hasGenerationContext);

  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  // Regenerate + quick-generate are fire-and-forget: instead of a re-entry lock
  // (which made the buttons un-spam-able while a submit was still in flight) we
  // track how many submits are currently in flight. The UI can show a live
  // count badge without ever blocking the next tap.
  const [regenerateInFlight, setRegenerateInFlight] = useState(0);
  const [quickGenInFlight, setQuickGenInFlight] = useState(0);
  const isRegenerating = regenerateInFlight > 0;
  const isQuickGenerating = quickGenInFlight > 0;
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);
  const [isInsertingPrompt, setIsInsertingPrompt] = useState(false);
  const [isInsertingSeed, setIsInsertingSeed] = useState(false);
  const [isInsertingAssets, setIsInsertingAssets] = useState(false);

  // Cache the per-asset generation-context fetch so rapid re-fires (spam) don't
  // re-hit the network for the same immutable source generation. Concurrent
  // callers share one in-flight promise; a rejected fetch is evicted so a later
  // retry can re-fetch cleanly.
  const genContextCacheRef = useRef<Map<number, ReturnType<typeof getAssetGenerationContext>>>(
    new Map(),
  );
  const fetchGenContextCached = useCallback((assetId: number) => {
    const cache = genContextCacheRef.current;
    const cached = cache.get(assetId);
    if (cached) return cached;
    const p = getAssetGenerationContext(assetId).catch((err) => {
      cache.delete(assetId);
      throw err;
    });
    cache.set(assetId, p);
    return p;
  }, []);

  // Get generations store for seeding new generations
  const addOrUpdateGeneration = useGenerationsStore((s) => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore((s) => s.setWatchingGeneration);

  // When no live Quick Gen widget is mounted to receive a load/insert (e.g. the
  // mobile gallery, where the Control Center — and its QuickGenWidget — isn't
  // mounted), queue the intent so the next Quick Gen surface to open drains it.
  // See quickGenStagingStore + QuickGenWidget's drain effect.
  const stageForLater = useCallback(
    (
      kind: 'load' | 'patch' | 'insert-prompt' | 'insert-seed' | 'insert-assets',
      extra?: { withoutSeed?: boolean },
    ) => {
      useQuickGenStagingStore.getState().stage({
        kind,
        asset: inputAsset,
        fallbackOperationType: operationType,
        ...extra,
      });
      useToastStore.getState().addToast({
        type: 'info',
        message: 'Queued for Quick Gen — applies when you next open Quick Gen.',
        duration: 3500,
      });
    },
    [inputAsset, operationType],
  );

  // Resolve the generation scope to write into: prefer the widget's own scope,
  // fall back to this card's scoped store, then the global scope.
  const resolveScopeId = useCallback(
    (scopeId?: string | null): string => scopeId ?? scopedScopeId ?? 'global',
    [scopedScopeId],
  );

  const submitDirectGeneration = useCallback(
    async (options: {
      operationType: OperationType;
      providerId?: string;
      prompt: string;
      params: Record<string, unknown>;
      successMessage: string;
      /** Caller-owned upload phase has already happened (and shown its own
       *  toast); skip the gate's "Uploading image to …" interim toast to
       *  avoid double-flashing for the trailing cache-hit gate call. */
      skipUploadToast?: boolean;
      /** Suppress the per-submission success toast (e.g. a burst shows one
       *  consolidated toast for the whole batch instead of N). */
      silent?: boolean;
    }) => {
      const { operationType: requestedOperationType, providerId, prompt, params, successMessage, skipUploadToast, silent } = options;
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
        // Interim feedback while the provider-accept gate uploads the input
        // image (e.g. an extracted frame). Dismissed when the upload phase
        // ends — success continues to the "…started" toast below; a
        // provider rejection throws and surfaces via the caller's catch.
        ...(skipUploadToast
          ? {}
          : {
              onInputUploadStart: ({ providerId: targetProviderId }) => {
                const label = targetProviderId
                  ? targetProviderId.charAt(0).toUpperCase() + targetProviderId.slice(1)
                  : 'provider';
                const toastId = useToastStore.getState().addToast({
                  type: 'info',
                  message: `Uploading image to ${label}…`,
                  duration: 20000,
                });
                return () => useToastStore.getState().removeToast(toastId);
              },
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

      if (!silent) {
        useToastStore.getState().addToast({
          type: 'success',
          message: successMessage,
          duration: 3000,
        });
      }
    },
    [addOrUpdateGeneration, setWatchingGeneration],
  );

  // Quick generate: delegates to the controller's pipeline directly,
  // bypassing widget state management (no flash on Go button).
  const executeQuickGenerate = useCallback(async (
    options?: { reuseSourceSeed?: boolean; count?: number },
  ) => {
    if (!widgetContext?.executeGeneration) return;
    // Route ×N through the widget's own `count` — the same path the on-card
    // swipe gesture uses (useMediaGenerationActions.quickGenerate) — so seed
    // handling stays identical across both surfaces instead of an external loop.
    const count = Math.max(1, Math.floor(options?.count ?? 1));
    setQuickGenInFlight((n) => n + count);
    try {
      let paramOverrides: GenerateOverrides['paramOverrides'] | undefined;
      if (options?.reuseSourceSeed) {
        if (!hasSourceContext) {
          useToastStore.getState().addToast({
            type: 'info',
            message: 'No source generation seed is available for this asset.',
            duration: 2500,
          });
          return;
        }

        const ctx = await fetchGenContextCached(id);
        const { params } = parseGenerationContext(ctx, operationType);
        const sourceSeed = extractSeedFromParams(params);

        if (sourceSeed === undefined) {
          useToastStore.getState().addToast({
            type: 'info',
            message: 'No seed found in source generation settings.',
            duration: 2500,
          });
          return;
        }

        paramOverrides = { seed: sourceSeed };
      }

      await widgetContext.executeGeneration({
        assetOverrides: [inputAsset],
        count,
        ...(paramOverrides ? { paramOverrides } : {}),
      });
    } catch (err) {
      useToastStore.getState().addToast({
        type: 'error',
        message: `Quick generate failed: ${extractErrorMessage(err)}`,
        duration: 4000,
      });
    } finally {
      setQuickGenInFlight((n) => Math.max(0, n - count));
    }
  }, [
    widgetContext,
    inputAsset,
    hasSourceContext,
    id,
    operationType,
    fetchGenContextCached,
  ]);

  const handleQuickGenerate = useCallback(async (count?: number) => {
    await executeQuickGenerate({ count });
  }, [executeQuickGenerate]);

  const handleQuickGenerateReuseSeed = useCallback(async (count?: number) => {
    await executeQuickGenerate({ reuseSourceSeed: true, count });
  }, [executeQuickGenerate]);

  const handleLoadToQuickGen = useCallback(async (options?: { withoutSeed?: boolean }) => {
    if (!loadToQuickGenDescriptor.isVisible(inputAsset) || isLoadingSource) return;
    const withoutSeed = options?.withoutSeed === true;

    // No live Quick Gen widget to receive the load (e.g. mobile gallery, where
    // the Control Center — and its QuickGenWidget — isn't mounted). Stage the
    // intent so the next Quick Gen surface to open drains it, instead of bailing
    // with "not available". See quickGenStagingStore.
    if (!widgetContext) {
      stageForLater('load', { withoutSeed });
      return;
    }

    setIsLoadingSource(true);
    try {
      await loadToQuickGenDescriptor.execute(
        inputAsset,
        { widget: widgetContext, fallbackOperationType: operationType, scopeId: scopedScopeId },
        { withoutSeed },
      );
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
    inputAsset,
    isLoadingSource,
    operationType,
    widgetContext,
    scopedScopeId,
    stageForLater,
  ]);

  const handleInsertPromptOnly = useCallback(async () => {
    if (!hasSourceContext || isInsertingPrompt) return;
    if (!widgetContext) {
      stageForLater('insert-prompt');
      return;
    }

    setIsInsertingPrompt(true);
    try {
      await insertPromptToQuickGen(inputAsset, operationType, {
        widget: widgetContext,
        scopeId: scopedScopeId,
      });
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
    hasSourceContext,
    isInsertingPrompt,
    widgetContext,
    inputAsset,
    operationType,
    scopedScopeId,
    stageForLater,
  ]);

  const handleInsertSeedOnly = useCallback(async () => {
    if (!hasSourceContext || isInsertingSeed) return;
    if (!widgetContext) {
      stageForLater('insert-seed');
      return;
    }

    setIsInsertingSeed(true);
    try {
      await insertSeedToQuickGen(inputAsset, operationType, {
        widget: widgetContext,
        scopeId: scopedScopeId,
      });
    } catch (error) {
      console.error('Failed to insert seed:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: 'Failed to load seed.',
        duration: 4000,
      });
    } finally {
      setIsInsertingSeed(false);
    }
  }, [
    hasSourceContext,
    isInsertingSeed,
    widgetContext,
    inputAsset,
    operationType,
    scopedScopeId,
    stageForLater,
  ]);

  // Replace the active widget's inputs with the source generation's assets.
  // "Load" (not "insert") semantics: it swaps out whatever is currently
  // queued for this operation so the widget mirrors the source generation.
  const handleInsertAssetsOnly = useCallback(async () => {
    if (!hasSourceContext || isInsertingAssets) return;
    if (!widgetContext) {
      stageForLater('insert-assets');
      return;
    }

    setIsInsertingAssets(true);
    try {
      await insertAssetsToQuickGen(inputAsset, operationType, {
        widget: widgetContext,
        scopeId: scopedScopeId,
      });
    } catch (error) {
      console.error('Failed to load source assets:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: `Failed to load source assets: ${extractErrorMessage(error)}`,
        duration: 4000,
      });
    } finally {
      setIsInsertingAssets(false);
    }
  }, [
    hasSourceContext,
    isInsertingAssets,
    widgetContext,
    inputAsset,
    operationType,
    scopedScopeId,
    stageForLater,
  ]);

  // Handler for extending video with the same prompt
  const handleExtendVideo = useCallback(async (promptSource: 'same' | 'active') => {
    if (isExtending || mediaType !== 'video') return;
    if (promptSource === 'same' && !hasSourceContext) return;

    setIsExtending(true);

    try {
      const ctx = await getAssetGenerationContext(id);
      const { params: originalParams, providerId, prompt: originalPrompt } = parseGenerationContext(ctx, operationType);

      // Use the active widget prompt or the original generation prompt
      let prompt = originalPrompt;
      if (promptSource === 'active') {
        const scopeId = resolveScopeId(widgetContext?.scopeId);
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
    hasSourceContext,
    isExtending,
    mediaType,
    operationType,
    id,
    inputAsset,
    widgetContext?.scopeId,
    resolveScopeId,
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
    if (promptSource === 'same' && !hasSourceContext) return;

    setIsExtending(true);

    // Selector-aware label, reused by both the success and the error path.
    const frameLabel =
      selector.mode === 'last'
        ? 'last frame'
        : selector.mode === 'first'
          ? 'first frame'
          : `frame at ${selector.seconds.toFixed(2)}s`;

    try {
      const ctx = await getAssetGenerationContext(id);
      const { params: originalParams, providerId, prompt: originalPrompt } = parseGenerationContext(ctx, operationType);

      // Resolve prompt from chosen source
      let prompt = originalPrompt;
      if (promptSource === 'active') {
        const scopeId = resolveScopeId(widgetContext?.scopeId);
        prompt = getGenerationSessionStore(scopeId).getState().prompt || '';
      }

      // Pass `provider_id` so the backend extract-frame endpoint runs its
      // atomic gate: it creates the frame with searchable=False and only
      // flips it to True after the provider accepts the upload. A rejected
      // frame stays hidden — no orphan in the gallery.
      const frameRequest: Parameters<typeof extractFrame>[0] = {
        ...(selector.mode === 'last'
          ? { video_asset_id: id, last_frame: true }
          : selector.mode === 'first'
            ? { video_asset_id: id, timestamp: 0 }
            : { video_asset_id: id, timestamp: selector.seconds }),
        ...(providerId ? { provider_id: providerId } : {}),
      };

      // Interim toast while extract + provider upload run server-side.
      const uploadToastId = providerId
        ? useToastStore.getState().addToast({
            type: 'info',
            message: `Uploading ${frameLabel} to ${providerId.charAt(0).toUpperCase() + providerId.slice(1)}…`,
            duration: 30000,
          })
        : null;
      let frameResponse;
      try {
        frameResponse = await extractFrame(frameRequest);
      } finally {
        if (uploadToastId) useToastStore.getState().removeToast(uploadToastId);
      }

      // If we asked for a provider upload but the response has no entry for
      // it, the provider rejected the frame (backend already kept the asset
      // hidden). Throw so the catch shows the moderation message.
      if (providerId) {
        const uploads = frameResponse.provider_uploads as Record<string, unknown> | undefined;
        if (!uploads || !uploads[providerId]) {
          throw new Error(
            `Provider ${providerId} rejected the extracted frame (content filtered / not compliant).`,
          );
        }
      }

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

      const promptLabel = promptSource === 'active' ? ' (active prompt)' : '';
      await submitDirectGeneration({
        operationType: 'image_to_video',
        providerId,
        prompt: buildResult.finalPrompt,
        params: submitParams,
        successMessage: `Extending video from ${frameLabel}${promptLabel}...`,
        // Frame was just uploaded by extract-frame above; the gate inside
        // generateAsset will be a fast cache-hit — suppress its toast so
        // we don't double-flash the same message.
        skipUploadToast: true,
      });
    } catch (error) {
      console.error('Failed to artificially extend video:', error);
      const raw = extractErrorMessage(error);
      const lower = raw.toLowerCase();
      const isModerationReject =
        lower.includes('not compliant')
        || lower.includes('content policy')
        || lower.includes('moderation')
        || lower.includes('content filtered')
        || lower.includes('rejected');
      const message = isModerationReject
        ? `Provider rejected the ${frameLabel} from the source video. The extracted frame was hidden from your library — try a different frame, a different source, or native extend.`
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
    hasSourceContext,
    isExtending,
    mediaType,
    operationType,
    id,
    widgetContext?.scopeId,
    resolveScopeId,
    submitDirectGeneration,
  ]);

  // Handler for regenerating (re-run the exact same generation)
  const executeRegenerate = useCallback(async (
    options?: { reuseSourceSeed?: boolean; silent?: boolean },
  ) => {
    if (!hasSourceContext) return;

    setRegenerateInFlight((n) => n + 1);

    try {
      // Fetch generation context (from record or metadata; cached per asset so
      // rapid re-fires share one fetch).
      const ctx = await fetchGenContextCached(id);
      const {
        params,
        operationType: resolvedOperationType,
        providerId,
        prompt,
        sourceAssetIds,
      } = parseGenerationContext(ctx, operationType);

      const sourceParams = stripSeedFromParams(params as Record<string, unknown>);

      // Backfill source asset references + composition_assets so the backend
      // keeps the correct operation type (e.g. image_to_video stays i2v
      // instead of falling back to text_to_video) for legacy generations
      // whose canonical_params omit them.
      ensureSourceAssetParams(sourceParams, resolvedOperationType, sourceAssetIds);

      const parsedParams = toParamsRecord(params);
      const shouldRandomizeSeed =
        paramsIncludeSeed(parsedParams)
        || await operationSupportsSeedParam(providerId, resolvedOperationType);
      if (options?.reuseSourceSeed) {
        const sourceSeed = extractSeedFromParams(parsedParams);
        if (sourceSeed === undefined) {
          useToastStore.getState().addToast({
            type: 'info',
            message: 'No seed found in source generation settings.',
            duration: 2500,
          });
          return;
        }
        if (shouldRandomizeSeed) {
          sourceParams.seed = sourceSeed;
        }
      } else if (shouldRandomizeSeed) {
        sourceParams.seed = nextRandomGenerationSeed();
      }
      await submitDirectGeneration({
        operationType: resolvedOperationType,
        providerId,
        prompt,
        params: sourceParams,
        successMessage: 'Regenerating...',
        silent: options?.silent,
        // Regenerate reuses the source asset's cached provider upload; the
        // preflight gate still validates it, but should not show upload UI.
        skipUploadToast: true,
      });
    } catch (error) {
      console.error('Failed to regenerate:', error);
      useToastStore.getState().addToast({
        type: 'error',
        message: `Failed to regenerate: ${extractErrorMessage(error)}`,
        duration: 4000,
      });
    } finally {
      setRegenerateInFlight((n) => Math.max(0, n - 1));
    }
  }, [
    id,
    hasSourceContext,
    operationType,
    submitDirectGeneration,
    fetchGenContextCached,
  ]);

  const handleRegenerate = useCallback(async () => {
    await executeRegenerate();
  }, [executeRegenerate]);

  const handleRegenerateReuseSeed = useCallback(async () => {
    await executeRegenerate({ reuseSourceSeed: true });
  }, [executeRegenerate]);

  // Burst regenerate: fire N submits but show a single consolidated toast
  // instead of N (each submit is silenced; one summary toast covers the batch).
  // Mirrors the style-variations "Generating N…" pattern.
  const handleRegenerateBurst = useCallback(async (
    count: number,
    options: { reuseSourceSeed: boolean },
  ) => {
    const n = Math.max(1, Math.floor(count));
    if (n === 1) {
      await executeRegenerate({ reuseSourceSeed: options.reuseSourceSeed });
      return;
    }
    for (let i = 0; i < n; i += 1) {
      void executeRegenerate({ reuseSourceSeed: options.reuseSourceSeed, silent: true });
    }
    useToastStore.getState().addToast({
      type: 'success',
      message: `Regenerating ×${n}…`,
      duration: 3000,
    });
  }, [executeRegenerate]);

  /**
   * Generate style variations: re-run the same generation with different
   * style primitive texts appended to the original prompt.
   *
   * @param category - style primitive category to sweep (default: aesthetic_preset)
   * @param blockIds - optional subset of block_ids; when omitted, all blocks in the category are used
   */
  const handleGenerateStyleVariations = useCallback(
    async (category = 'aesthetic_preset', blockIds?: string[]) => {
      if (!hasSourceContext || isGeneratingVariations) return;

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

        // Preserve source asset references (same logic as handleRegenerate).
        ensureSourceAssetParams(sourceParams, resolvedOperationType, sourceAssetIds);

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
      hasSourceContext,
      isGeneratingVariations,
      operationType,
      addOrUpdateGeneration,
      setWatchingGeneration,
    ],
  );

  return {
    isQuickGenerating,
    quickGenInFlight,
    isLoadingSource,
    isExtending,
    isRegenerating,
    regenerateInFlight,
    isGeneratingVariations,
    isInsertingPrompt,
    isInsertingSeed,
    isInsertingAssets,
    handleQuickGenerate,
    handleQuickGenerateReuseSeed,
    handleLoadToQuickGen,
    handleInsertPromptOnly,
    handleInsertSeedOnly,
    handleInsertAssetsOnly,
    handleExtendWithSamePrompt,
    handleExtendWithActivePrompt,
    handleArtificialExtend,
    handleRegenerate,
    handleRegenerateReuseSeed,
    handleRegenerateBurst,
    handleGenerateStyleVariations,
  };
}
