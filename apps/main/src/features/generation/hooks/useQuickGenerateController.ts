import { useState, useEffect, useRef, useCallback } from 'react';

import { extractErrorMessage } from '@lib/api/errorHandling';
import { logEvent } from '@lib/utils/logging';

import { extractFrame, fromAssetResponse, getAssetDisplayUrls } from '@features/assets';
import { useGenerationsStore, createPendingGeneration } from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import { useQuickGenerateBindings } from '@features/prompts';

import { getFallbackOperation } from '@/types/operations';

import { buildGenerationRequest } from '../lib/quickGenerateLogic';
import { useGenerationHistoryStore } from '../stores/generationHistoryStore';



/** Record assets used for a generation in the history store */
function recordInputHistory(operationType: string, inputs: any[]) {
  const assetsToRecord = inputs
    .filter((item: any) => item?.asset)
    .map((item: any) => {
      const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(item.asset);
      return {
        id: item.asset.id,
        thumbnailUrl: thumbnailUrl || previewUrl || mainUrl || '',
        mediaType: item.asset.mediaType,
      };
    });
  if (assetsToRecord.length > 0) {
    useGenerationHistoryStore.getState().recordUsage(operationType, assetsToRecord);
  }
}

/**
 * Hook: useQuickGenerateController
 *
 * Orchestrates QuickGenerateModule behavior:
 * - Reads/writes Control Center store state.
 * - Binds to inputs and active asset via useQuickGenerateBindings.
 * - Runs validation + parameter construction via buildGenerationRequest.
 * - Calls the generation API and seeds generationsStore.
 *
 * This keeps QuickGenerateModule focused on rendering/layout.
 */
export function useQuickGenerateController() {
  const { useSessionStore, useInputStore } = useGenerationScopeStores();

  // Generation session state (scoped)
  const operationType = useSessionStore((s) => s.operationType);
  const providerId = useSessionStore((s) => s.providerId);
  const generating = useSessionStore((s) => s.generating);

  const setProvider = useSessionStore((s) => s.setProvider);
  const setOperationType = useSessionStore((s) => s.setOperationType);
  const setGenerating = useSessionStore((s) => s.setGenerating);
  const prompt = useSessionStore((s) => s.prompt);
  const setPrompt = useSessionStore((s) => s.setPrompt);

  // Bindings to active asset and inputs
  const bindings = useQuickGenerateBindings(operationType);

  // Local error + generation status
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<number | null>(null);

  // Queue progress state for burst mode
  const [queueProgress, setQueueProgress] = useState<{ queued: number; total: number } | null>(null);
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore(s => s.setWatchingGeneration);

  // Watch for generation failures and display error in prompt box
  // Use selector to only get the specific generation we're watching
  const watchedGeneration = useGenerationsStore(s =>
    generationId ? s.generations.get(generationId) : undefined
  );
  const watchedStatus = watchedGeneration?.status;
  const watchedErrorMessage = watchedGeneration?.errorMessage;

  // Track which generation we've already shown error for (prevents re-triggering)
  const errorShownForRef = useRef<number | null>(null);

  useEffect(() => {
    // Skip if no generation, not failed, no error message, or already shown
    if (!generationId || watchedStatus !== 'failed' || !watchedErrorMessage) return;
    if (errorShownForRef.current === generationId) return;

    // Show error in prompt box for prompt rejections and input validation errors
    // (not for other failures like quota, network errors, output rejections, etc.)
    // Primary: dispatch on structured errorCode. Fallback: string matching for legacy.
    const errorCode = watchedGeneration?.errorCode;
    const lowerError = watchedErrorMessage.toLowerCase();

    const isPromptRejection = errorCode === 'content_prompt_rejected'
      || errorCode === 'content_text_rejected'
      || (!errorCode && (
        lowerError.includes('content filtered (prompt)')
        || lowerError.includes('content filtered (text)')
        || lowerError.includes('prompt rejected')
        || lowerError.includes('text input was rejected')
        || lowerError.includes('sensitive')
        || lowerError.includes('500063')
        || (lowerError.includes('content') && lowerError.includes('text'))
      ));

    const isPromptTooLong = errorCode === 'param_too_long'
      || (!errorCode && (
        lowerError.includes('too-long parameters')
        || lowerError.includes('cannot exceed')
        || lowerError.includes('prompt is too long')
        || lowerError.includes('input is too long')
      ));

    if (!isPromptRejection && !isPromptTooLong) return;

    // Mark as shown before setting error
    errorShownForRef.current = generationId;

    if (isPromptTooLong) {
      setError('Prompt too long: Your prompt exceeds the provider\'s character limit. Please shorten it and try again.');
    } else {
      setError('Content filtered: Your prompt may contain sensitive content. Please revise and try again.');
    }
  }, [generationId, watchedStatus, watchedErrorMessage]);

  // ─── Shared generation helpers ───

  /** Reset state for a new generation attempt */
  function resetForGeneration() {
    setError(null);
    setGenerating(true);
    setGenerationId(null);
    errorShownForRef.current = null;
  }

  /** Read current input state from store (avoids stale React hook values) */
  function getInputState() {
    const inputState = (useInputStore as any).getState();
    const currentInputs = inputState.inputsByOperation?.[operationType]?.items ?? [];
    const currentInput = inputState.getCurrentInput
      ? inputState.getCurrentInput(operationType)
      : null;
    const transitionInputs = inputState.inputsByOperation?.video_transition?.items ?? [];
    return { currentInputs, currentInput, transitionInputs };
  }

  /** Extract frames for video inputs, mutating dynamicParams in-place */
  async function applyFrameExtraction(
    dynamicParams: Record<string, any>,
    currentInput: any,
    transitionInputs: any[],
  ) {
    if (operationType === 'image_to_video' && currentInput) {
      if (currentInput.lockedTimestamp !== undefined && currentInput.asset.mediaType === 'video') {
        const extractedFrame = fromAssetResponse(await extractFrame({
          video_asset_id: currentInput.asset.id,
          timestamp: currentInput.lockedTimestamp,
        }));
        dynamicParams.source_asset_id = extractedFrame.id;
      }
    }

    if (operationType === 'video_transition' && transitionInputs.length > 0) {
      const extractedAssetIds: number[] = [];
      for (const item of transitionInputs) {
        if (item.lockedTimestamp !== undefined && item.asset.mediaType === 'video') {
          const extractedFrame = fromAssetResponse(await extractFrame({
            video_asset_id: item.asset.id,
            timestamp: item.lockedTimestamp,
          }));
          extractedAssetIds.push(extractedFrame.id);
        } else {
          extractedAssetIds.push(item.asset.id);
        }
      }
      dynamicParams.source_asset_ids = extractedAssetIds;
    }
  }

  /** Build and validate a generation request, resolving the effective operation type */
  function buildRequest(
    dynamicParams: Record<string, any>,
    operationInputs: any[],
    currentInput: any,
  ): { error: string } | { finalPrompt: string; params: any; effectiveOperationType: string } {
    const buildResult = buildGenerationRequest({
      operationType,
      prompt,
      dynamicParams,
      operationInputs,
      prompts: bindings.prompts,
      transitionDurations: bindings.transitionDurations,
      activeAsset: bindings.lastSelectedAsset,
      currentInput,
    });

    if (buildResult.error || !buildResult.params) {
      return { error: buildResult.error ?? 'Invalid generation request' };
    }

    const hasAssetInput =
      Array.isArray(buildResult.params.composition_assets) && buildResult.params.composition_assets.length > 0;

    return {
      finalPrompt: buildResult.finalPrompt,
      params: buildResult.params,
      effectiveOperationType: getFallbackOperation(operationType, hasAssetInput),
    };
  }

  /** Submit a single generation to the API and seed the generations store */
  async function submitOne(request: { finalPrompt: string; params: any; effectiveOperationType: string }) {
    const result = await generateAsset({
      prompt: request.finalPrompt,
      providerId,
      operationType: request.effectiveOperationType,
      extraParams: request.params,
    });

    const genId = result.job_id;
    addOrUpdateGeneration(createPendingGeneration({
      id: genId,
      operationType,
      providerId,
      finalPrompt: request.finalPrompt,
      params: request.params,
      status: result.status || 'pending',
    }));

    return genId;
  }

  // ─── Generation actions ───

  async function generate(options?: { overrideDynamicParams?: Record<string, any> }) {
    resetForGeneration();

    try {
      const { currentInputs, currentInput, transitionInputs } = getInputState();
      const dynamicParams = { ...bindings.dynamicParams, ...options?.overrideDynamicParams };

      await applyFrameExtraction(dynamicParams, currentInput, transitionInputs);

      const request = buildRequest(dynamicParams, currentInputs, currentInput);
      if ('error' in request) {
        setError(request.error);
        setGenerating(false);
        return;
      }

      const genId = await submitOne(request);
      setGenerationId(genId);
      setWatchingGeneration(genId);
      recordInputHistory(operationType, currentInputs);

      logEvent('INFO', 'generation_created', {
        generationId: genId,
        operationType,
        providerId: providerId || 'pixverse',
        status: 'pending',
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to generate asset'));
    } finally {
      setGenerating(false);
    }
  }

  /**
   * Generate multiple times (burst mode).
   * Submits the same generation request N times for variety.
   */
  const generateBurst = useCallback(async (count: number, options?: { overrideDynamicParams?: Record<string, any> }) => {
    if (count <= 1) return generate(options);

    resetForGeneration();
    const total = count;
    let queued = 0;
    const generatedIds: number[] = [];
    setQueueProgress({ queued: 0, total });

    try {
      const { currentInputs, currentInput, transitionInputs } = getInputState();
      const dynamicParams = { ...bindings.dynamicParams, ...options?.overrideDynamicParams };

      await applyFrameExtraction(dynamicParams, currentInput, transitionInputs);

      const request = buildRequest(dynamicParams, currentInputs, currentInput);
      if ('error' in request) {
        setError(request.error);
        setGenerating(false);
        setQueueProgress(null);
        return;
      }

      recordInputHistory(operationType, currentInputs);

      for (let i = 0; i < count; i++) {
        try {
          const genId = await submitOne(request);
          generatedIds.push(genId);
          queued++;
          setQueueProgress({ queued, total });

          logEvent('INFO', 'burst_generation_created', {
            generationId: genId,
            operationType,
            providerId: providerId || 'pixverse',
            burstIndex: i + 1,
            burstTotal: count,
          });
        } catch (itemErr) {
          logEvent('ERROR', 'burst_item_failed', {
            burstIndex: i + 1,
            error: extractErrorMessage(itemErr, 'Unknown error'),
          });
        }
      }

      if (generatedIds.length > 0) {
        const lastId = generatedIds[generatedIds.length - 1];
        setGenerationId(lastId);
        setWatchingGeneration(lastId);
      }

      logEvent('INFO', 'burst_complete', {
        queued,
        total,
        operationType,
        providerId: providerId || 'pixverse',
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to queue generations'));
    } finally {
      setGenerating(false);
      setTimeout(() => setQueueProgress(null), 2000);
    }
  }, [
    generate,
    operationType,
    prompt,
    providerId,
    bindings.dynamicParams,
    bindings.prompts,
    bindings.transitionDurations,
    bindings.lastSelectedAsset,
    useInputStore,
    addOrUpdateGeneration,
    setWatchingGeneration,
    setGenerating,
  ]);

  /**
   * Generate individually for each queued input asset.
   * Same prompt and settings, but one generation per asset.
   */
  const generateEach = useCallback(async (options?: { overrideDynamicParams?: Record<string, any> }) => {
    const { currentInputs } = getInputState();
    if (currentInputs.length <= 1) return generate(options);

    resetForGeneration();
    const total = currentInputs.length;
    let queued = 0;
    const generatedIds: number[] = [];
    setQueueProgress({ queued: 0, total });

    try {
      const overrideParams = options?.overrideDynamicParams || {};

      for (let i = 0; i < currentInputs.length; i++) {
        const inputItem = currentInputs[i];

        try {
          const dynamicParams = { ...bindings.dynamicParams, ...overrideParams };
          await applyFrameExtraction(dynamicParams, inputItem, []);

          const request = buildRequest(dynamicParams, [inputItem], inputItem);
          if ('error' in request) {
            logEvent('ERROR', 'generate_each_item_skipped', {
              index: i,
              error: request.error,
            });
            continue;
          }

          const genId = await submitOne(request);
          generatedIds.push(genId);
          queued++;
          setQueueProgress({ queued, total });
          recordInputHistory(operationType, [inputItem]);

          logEvent('INFO', 'generate_each_created', {
            generationId: genId,
            operationType,
            providerId: providerId || 'pixverse',
            eachIndex: i + 1,
            eachTotal: total,
          });
        } catch (itemErr) {
          logEvent('ERROR', 'generate_each_item_failed', {
            eachIndex: i + 1,
            error: extractErrorMessage(itemErr, 'Unknown error'),
          });
        }
      }

      if (generatedIds.length > 0) {
        const lastId = generatedIds[generatedIds.length - 1];
        setGenerationId(lastId);
        setWatchingGeneration(lastId);
      }

      logEvent('INFO', 'generate_each_complete', {
        queued,
        total,
        operationType,
        providerId: providerId || 'pixverse',
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to queue individual generations'));
    } finally {
      setGenerating(false);
      setTimeout(() => setQueueProgress(null), 2000);
    }
  }, [
    generate,
    operationType,
    prompt,
    providerId,
    bindings.dynamicParams,
    bindings.prompts,
    bindings.transitionDurations,
    bindings.lastSelectedAsset,
    useInputStore,
    addOrUpdateGeneration,
    setWatchingGeneration,
    setGenerating,
  ]);

  return {
    // Core control center state
    operationType,
    providerId,
    generating,
    prompt,

    // Mutators
    setProvider,
    setOperationType,
    setPrompt,

    // Error + generation ID
    error,
    generationId,

    // Queue progress (for burst mode)
    queueProgress,

    // Bindings to assets/inputs and params
    ...bindings,

    // Actions
    generate,
    generateBurst,
    generateEach,
  };
}
