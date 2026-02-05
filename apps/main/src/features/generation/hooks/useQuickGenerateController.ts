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
  const presetId = useSessionStore((s) => s.presetId);
  const presetParams = useSessionStore((s) => s.presetParams);
  const generating = useSessionStore((s) => s.generating);

  const setProvider = useSessionStore((s) => s.setProvider);
  const setOperationType = useSessionStore((s) => s.setOperationType);
  const setGenerating = useSessionStore((s) => s.setGenerating);
  const setPresetParams = useSessionStore((s) => s.setPresetParams);
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

    // Only show error in prompt box for content-filtered prompt rejections
    // (not for other failures like quota, network errors, output rejections, etc.)
    const lowerError = watchedErrorMessage.toLowerCase();
    const isPromptRejection =
      lowerError.includes('content filtered (prompt)') ||
      lowerError.includes('content filtered (text)') ||
      lowerError.includes('prompt rejected') ||
      lowerError.includes('text input was rejected') ||
      lowerError.includes('sensitive') ||
      lowerError.includes('500063') ||
      (lowerError.includes('content') && lowerError.includes('text'));

    if (!isPromptRejection) return;

    // Mark as shown before setting error
    errorShownForRef.current = generationId;

    setError('Content filtered: Your prompt may contain sensitive content. Please revise and try again.');
  }, [generationId, watchedStatus, watchedErrorMessage]);

  async function generate(options?: { overrideDynamicParams?: Record<string, any> }) {
    setError(null);
    setGenerating(true);
    setGenerationId(null);
    errorShownForRef.current = null; // Reset so new generation can show errors

    try {
      const overrideParams = options?.overrideDynamicParams || {};

      // Merge dynamic params with any overrides
      const modifiedDynamicParams = {
        ...bindings.dynamicParams,
        ...overrideParams,
      };

      // Get current input state directly from store to avoid stale React hook values
      // This is critical for frame extraction and passing context to logic
      const inputState = (useInputStore as any).getState();
      const currentInputs = inputState.inputsByOperation?.[operationType]?.items ?? [];
      const currentInput = inputState.getCurrentInput
        ? inputState.getCurrentInput(operationType)
        : null;

      // NOTE: We no longer set source_asset_id from inputs here.
      // That inference happens in buildGenerationRequest via currentInput context.
      // Controller only handles async operations (frame extraction).

      // For image_to_video: extract frame if video has locked timestamp
      if (operationType === 'image_to_video' && currentInput) {
        if (currentInput.lockedTimestamp !== undefined && currentInput.asset.mediaType === 'video') {
          const extractedFrame = fromAssetResponse(await extractFrame({
            video_asset_id: currentInput.asset.id,
            timestamp: currentInput.lockedTimestamp,
          }));
          // Set extracted frame's asset ID - this overrides input inference in logic
          modifiedDynamicParams.source_asset_id = extractedFrame.id;
        }
      }

      // For video_transition: extract frames for videos with locked timestamps
      const transitionInputs = inputState.inputsByOperation?.video_transition?.items ?? [];
      if (operationType === 'video_transition' && transitionInputs.length > 0) {
        const extractedAssetIds: number[] = [];
        for (const inputItem of transitionInputs) {
          if (inputItem.lockedTimestamp !== undefined && inputItem.asset.mediaType === 'video') {
            const extractedFrame = fromAssetResponse(await extractFrame({
              video_asset_id: inputItem.asset.id,
              timestamp: inputItem.lockedTimestamp,
            }));
            extractedAssetIds.push(extractedFrame.id);
          } else {
            extractedAssetIds.push(inputItem.asset.id);
          }
        }
        modifiedDynamicParams.source_asset_ids = extractedAssetIds;
      }

      const buildResult = buildGenerationRequest({
        operationType,
        prompt,
        presetParams,
        dynamicParams: modifiedDynamicParams,
        operationInputs: currentInputs,
        prompts: bindings.prompts,
        transitionDurations: bindings.transitionDurations,
        activeAsset: bindings.lastSelectedAsset,
        currentInput,
      });

      if (buildResult.error || !buildResult.params) {
        setError(buildResult.error ?? 'Invalid generation request');
        setGenerating(false);
        return;
      }

      const finalPrompt = buildResult.finalPrompt;

      // For flexible operations: switch to text-based operation if no image provided
      const hasAssetInput =
        Array.isArray(buildResult.params.composition_assets) && buildResult.params.composition_assets.length > 0;
      const effectiveOperationType = getFallbackOperation(operationType, hasAssetInput);

      const result = await generateAsset({
        prompt: finalPrompt,
        providerId,
        presetId,
        operationType: effectiveOperationType,
        extraParams: buildResult.params,
        presetParams,
      });

      // Record assets used for this generation in history
      const assetsToRecord = currentInputs
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

      // Keep prompt for easy re-generation with tweaks
      const genId = result.job_id;
      setGenerationId(genId);
      setWatchingGeneration(genId);

      // Seed store with initial generation status
      addOrUpdateGeneration(createPendingGeneration({
        id: genId,
        operationType,
        providerId,
        finalPrompt,
        params: buildResult.params,
        status: result.status || 'pending',
      }));

      logEvent('INFO', 'generation_created', {
        generationId: genId,
        operationType,
        providerId: providerId || 'pixverse',
        status: result.status || 'pending',
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
   * Backend handles capacity limits via account selection.
   */
  const generateBurst = useCallback(async (count: number, options?: { overrideDynamicParams?: Record<string, any> }) => {
    if (count <= 1) {
      // Just do a single generation
      return generate(options);
    }

    setError(null);
    setGenerating(true);
    setGenerationId(null);
    errorShownForRef.current = null;

    const total = count;
    let queued = 0;
    const generatedIds: number[] = [];

    setQueueProgress({ queued: 0, total });

    try {
      const overrideParams = options?.overrideDynamicParams || {};

      // Build params once (same for all burst generations)
      const modifiedDynamicParams = {
        ...bindings.dynamicParams,
        ...overrideParams,
      };

      // Get current input state
      const inputState = (useInputStore as any).getState();
      const currentInputs = inputState.inputsByOperation?.[operationType]?.items ?? [];
      const currentInput = inputState.getCurrentInput
        ? inputState.getCurrentInput(operationType)
        : null;

      // Handle frame extraction for video inputs (once, reuse for all)
      if (operationType === 'image_to_video' && currentInput) {
        if (currentInput.lockedTimestamp !== undefined && currentInput.asset.mediaType === 'video') {
          const extractedFrame = fromAssetResponse(await extractFrame({
            video_asset_id: currentInput.asset.id,
            timestamp: currentInput.lockedTimestamp,
          }));
          modifiedDynamicParams.source_asset_id = extractedFrame.id;
        }
      }

      // Handle video_transition frame extraction
      const transitionInputs = inputState.inputsByOperation?.video_transition?.items ?? [];
      if (operationType === 'video_transition' && transitionInputs.length > 0) {
        const extractedAssetIds: number[] = [];
        for (const inputItem of transitionInputs) {
          if (inputItem.lockedTimestamp !== undefined && inputItem.asset.mediaType === 'video') {
            const extractedFrame = fromAssetResponse(await extractFrame({
              video_asset_id: inputItem.asset.id,
              timestamp: inputItem.lockedTimestamp,
            }));
            extractedAssetIds.push(extractedFrame.id);
          } else {
            extractedAssetIds.push(inputItem.asset.id);
          }
        }
        modifiedDynamicParams.source_asset_ids = extractedAssetIds;
      }

      const buildResult = buildGenerationRequest({
        operationType,
        prompt,
        presetParams,
        dynamicParams: modifiedDynamicParams,
        operationInputs: currentInputs,
        prompts: bindings.prompts,
        transitionDurations: bindings.transitionDurations,
        activeAsset: bindings.lastSelectedAsset,
        currentInput,
      });

      if (buildResult.error || !buildResult.params) {
        setError(buildResult.error ?? 'Invalid generation request');
        setGenerating(false);
        setQueueProgress(null);
        return;
      }

      const finalPrompt = buildResult.finalPrompt;
      const hasAssetInput =
        Array.isArray(buildResult.params.composition_assets) && buildResult.params.composition_assets.length > 0;
      const effectiveOperationType = getFallbackOperation(operationType, hasAssetInput);

      // Record assets used for this burst in history (once, before the loop)
      const assetsToRecord = currentInputs
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

      // Submit N generations
      for (let i = 0; i < count; i++) {
        try {
          const result = await generateAsset({
            prompt: finalPrompt,
            providerId,
            presetId,
            operationType: effectiveOperationType,
            extraParams: buildResult.params,
            presetParams,
          });

          const genId = result.job_id;
          generatedIds.push(genId);

          addOrUpdateGeneration(createPendingGeneration({
            id: genId,
            operationType,
            providerId,
            finalPrompt,
            params: buildResult.params,
            status: result.status || 'pending',
          }));

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

      // Watch the last generated ID
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
    presetParams,
    providerId,
    presetId,
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
    presetId,
    presetParams,
    generating,
    prompt,

    // Mutators
    setProvider,
    setOperationType,
    setPrompt,
    setPresetParams,

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
  };
}
