import { useState, useEffect, useRef } from 'react';
import { useGenerationsStore, useGenerationQueueStore } from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { generateAsset } from '@features/controlCenter/lib/api';
import { extractFrame, fromAssetResponse } from '@features/assets';
import { logEvent } from '@lib/utils/logging';
import { buildGenerationRequest } from '../lib/quickGenerateLogic';
import { useQuickGenerateBindings } from './useQuickGenerateBindings';
import { extractErrorMessage } from '@lib/api/errorHandling';

/**
 * Hook: useQuickGenerateController
 *
 * Orchestrates QuickGenerateModule behavior:
 * - Reads/writes Control Center store state.
 * - Binds to queues and active asset via useQuickGenerateBindings.
 * - Runs validation + parameter construction via buildGenerationRequest.
 * - Calls the generation API and seeds generationsStore.
 *
 * This keeps QuickGenerateModule focused on rendering/layout.
 */
export function useQuickGenerateController() {
  const { useSessionStore } = useGenerationScopeStores();

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

  // Bindings to active asset and queues
  const bindings = useQuickGenerateBindings(operationType, setOperationType);

  // Local error + generation status
  const [error, setError] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const addOrUpdateGeneration = useGenerationsStore(s => s.addOrUpdate);
  const setWatchingGeneration = useGenerationsStore(s => s.setWatchingGeneration);
  const generations = useGenerationsStore(s => s.generations);

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
      const hasOverrideInput =
        overrideParams.image_url ||
        overrideParams.video_url ||
        overrideParams.original_video_id ||
        overrideParams.source_asset_id ||
        (Array.isArray(overrideParams.source_asset_ids) && overrideParams.source_asset_ids.length > 0);

      // Handle frame extraction for video assets with locked timestamps
      let modifiedDynamicParams = {
        ...bindings.dynamicParams,
        ...overrideParams,
      };

      // Get current queue state directly from store to avoid stale React hook values
      // This is critical when assets are enqueued right before generation
      const queueState = useGenerationQueueStore.getState();
      const currentMainQueue = queueState.mainQueue;
      const currentMainQueueIndex = queueState.mainQueueIndex;

      // Get current queue item based on index (1-based index, convert to 0-based)
      const currentIdx = Math.max(0, Math.min(currentMainQueueIndex - 1, currentMainQueue.length - 1));
      const currentQueueItem = currentMainQueue.length > 0 ? currentMainQueue[currentIdx] : null;

      if (!hasOverrideInput && currentQueueItem) {
        const asset = currentQueueItem.asset;
        if (operationType === 'image_to_video' || operationType === 'image_to_image') {
          if (asset.mediaType === 'image') {
            modifiedDynamicParams = {
              ...modifiedDynamicParams,
              // Pass asset ID so backend can look up provider_uploads
              source_asset_id: asset.id,
            };
            delete modifiedDynamicParams.video_url;
            delete modifiedDynamicParams.original_video_id;
            delete modifiedDynamicParams.image_url;
          }
        } else if (operationType === 'video_extend') {
          if (asset.mediaType === 'video') {
            modifiedDynamicParams = {
              ...modifiedDynamicParams,
              // Pass asset ID so backend can look up provider_uploads
              source_asset_id: asset.id,
            };
            delete modifiedDynamicParams.image_url;
            delete modifiedDynamicParams.video_url;
          }
        }
      }

      // For image_to_video: extract frame if video has locked timestamp
      if (operationType === 'image_to_video' && currentQueueItem) {
        if (currentQueueItem.lockedTimestamp !== undefined && currentQueueItem.asset.mediaType === 'video') {
          const extractedFrame = fromAssetResponse(await extractFrame({
            video_asset_id: currentQueueItem.asset.id,
            timestamp: currentQueueItem.lockedTimestamp,
          }));
          // Prefer asset ID; backend will resolve provider-specific URL
          modifiedDynamicParams.source_asset_id = extractedFrame.id;
          delete modifiedDynamicParams.image_url;
        }
      }

      // For video_transition: extract frames for videos with locked timestamps
      const currentMultiAssetQueue = queueState.multiAssetQueue;
      if (operationType === 'video_transition' && currentMultiAssetQueue.length > 0) {
        const extractedAssetIds: number[] = [];
        for (const queueItem of currentMultiAssetQueue) {
          if (queueItem.lockedTimestamp !== undefined && queueItem.asset.mediaType === 'video') {
            const extractedFrame = fromAssetResponse(await extractFrame({
              video_asset_id: queueItem.asset.id,
              timestamp: queueItem.lockedTimestamp,
            }));
            extractedAssetIds.push(extractedFrame.id);
          } else {
            // Use original URL (for images or videos without locked timestamp)
            extractedAssetIds.push(queueItem.asset.id);
          }
        }
        modifiedDynamicParams = {
          ...modifiedDynamicParams,
          source_asset_ids: extractedAssetIds,
        };
      }

      const sourceAssetIds = Array.isArray(modifiedDynamicParams.source_asset_ids)
        ? modifiedDynamicParams.source_asset_ids
        : undefined;

      const buildResult = buildGenerationRequest({
        operationType,
        prompt,
        presetParams,
        dynamicParams: modifiedDynamicParams,
        sourceAssetIds,
        prompts: bindings.prompts,
        transitionDurations: bindings.transitionDurations,
        activeAsset: bindings.lastSelectedAsset,
        mainQueueCurrent: currentQueueItem,
      });

      if (buildResult.error || !buildResult.params) {
        setError(buildResult.error ?? 'Invalid generation request');
        setGenerating(false);
        return;
      }

      const finalPrompt = buildResult.finalPrompt;

      // For flexible operations: switch to text-based operation if no image provided
      let effectiveOperationType = operationType;
      const hasImage =
        buildResult.params.image_url ||
        buildResult.params.source_asset_id ||
        (Array.isArray(buildResult.params.source_asset_ids) && buildResult.params.source_asset_ids.length > 0);
      if (!hasImage) {
        if (operationType === 'image_to_video') {
          effectiveOperationType = 'text_to_video';
        } else if (operationType === 'image_to_image') {
          effectiveOperationType = 'text_to_image';
        }
      }

      const result = await generateAsset({
        prompt: finalPrompt,
        providerId,
        presetId,
        operationType: effectiveOperationType,
        extraParams: buildResult.params,
        presetParams,
      });

      // Keep prompt for easy re-generation with tweaks
      const genId = result.job_id;
      setGenerationId(genId);
      setWatchingGeneration(genId);

      // Seed store with initial generation status
      const now = new Date().toISOString();
      addOrUpdateGeneration({
        id: genId,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        scheduledAt: null,
        status: result.status || 'pending',
        errorMessage: null,
        retryCount: 0,
        priority: 5,
        name: null,
        description: null,
        operationType,
        providerId: providerId || 'pixverse',
        finalPrompt,
        promptSourceType: 'inline',
        promptVersionId: null,
        promptConfig: null,
        rawParams: buildResult.params,
        canonicalParams: buildResult.params,
        inputs: [],
        reproducibleHash: null,
        account: null,
        accountEmail: null,
        asset: null,
        assetId: null,
        user: null,
        workspace: null,
        parentGeneration: null,
      });

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

    // Bindings to assets/queues and params
    ...bindings,

    // Actions
    generate,
  };
}
