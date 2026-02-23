import { useState, useEffect, useRef, useCallback } from 'react';

import { rollTemplate } from '@lib/api/blockTemplates';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { logEvent } from '@lib/utils/logging';

import { extractFrame, fromAssetResponse, getAssetDisplayUrls, toSelectedAsset, type AssetModel } from '@features/assets';
import { resolveAssetSet, assetModelsToInputItems } from '@features/assets/lib/assetSetResolver';
import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import { useGenerationsStore, createPendingGeneration } from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { generateAsset } from '@features/generation/lib/api';
import { useQuickGenerateBindings } from '@features/prompts';
import { useBlockTemplateStore } from '@features/prompts/stores/blockTemplateStore';
import { providerCapabilityRegistry } from '@features/providers';

import { getFallbackOperation } from '@/types/operations';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';


import { computeCombinations, computeSetCombinations, isSetStrategy, type EachStrategy, type CombinationStrategy } from '../lib/combinationStrategies';
import { buildGenerationRequest } from '../lib/quickGenerateLogic';
import { createGenerationRunDescriptor, createGenerationRunItemContext, type GenerationRunContext } from '../lib/runContext';
import { useGenerationHistoryStore } from '../stores/generationHistoryStore';



/** Throw if the extracted frame failed to upload to any provider (no usable provider_uploads). */
function assertFrameUploadSucceeded(frame: AssetModel) {
  const statuses = frame.lastUploadStatusByProvider;
  const hasUploadError = statuses && Object.values(statuses).some(s => s === 'error');
  const hasSuccessfulUpload = frame.providerUploads && Object.keys(frame.providerUploads).length > 0;
  if (hasUploadError && !hasSuccessfulUpload) {
    throw new Error('Frame extracted but upload to provider failed. The frame cannot be used for generation until it is uploaded — try re-uploading from the gallery.');
  }
}

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

function extractInputAssetIds(group: any[]): number[] {
  return group
    .map((item) => item?.asset?.id)
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
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
  const { useSettingsStore, useSessionStore, useInputStore } = useGenerationScopeStores();

  // Generation session state (scoped)
  const operationType = useSessionStore((s) => s.operationType);
  const storeProviderId = useSessionStore((s) => s.providerId);
  const generating = useSessionStore((s) => s.generating);

  // Resolve provider from model when session store doesn't have an explicit one.
  // This matches what useGenerationWorkbench shows in the UI.
  const currentModel = useSettingsStore((s) => s.params?.model) as string | undefined;
  const modelProviderId = currentModel
    ? providerCapabilityRegistry.getProviderIdForModel(currentModel)
    : undefined;
  const providerId = storeProviderId ?? modelProviderId;

  const setProvider = useSessionStore((s) => s.setProvider);
  const setOperationType = useSessionStore((s) => s.setOperationType);
  const setGenerating = useSessionStore((s) => s.setGenerating);
  const prompt = useSessionStore((s) => s.prompt);
  const setPrompt = useSessionStore((s) => s.setPrompt);

  // Template pinning state (global, from blockTemplateStore)
  const pinnedTemplateId = useBlockTemplateStore((s) => s.pinnedTemplateId);
  const templateRollMode = useBlockTemplateStore((s) => s.templateRollMode);

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

  /** If the input has a locked timestamp on a video, extract the frame and return its id. Otherwise null. */
  async function maybeExtractFrame(input: any): Promise<number | null> {
    if (input.lockedTimestamp === undefined || input.asset.mediaType !== 'video') return null;
    const frame = fromAssetResponse(await extractFrame({
      video_asset_id: input.asset.id,
      timestamp: input.lockedTimestamp,
    }));
    assertFrameUploadSucceeded(frame);
    return frame.id;
  }

  /** Extract frames for video inputs, mutating dynamicParams in-place */
  async function applyFrameExtraction(
    dynamicParams: Record<string, any>,
    currentInput: any,
    transitionInputs: any[],
  ) {
    if (currentInput) {
      const frameId = await maybeExtractFrame(currentInput);
      if (frameId !== null) dynamicParams.source_asset_id = frameId;
    }

    if (transitionInputs.length > 0) {
      dynamicParams.source_asset_ids = await Promise.all(
        transitionInputs.map(async item => await maybeExtractFrame(item) ?? item.asset.id),
      );
    }
  }

  /** Roll the pinned template (if any) and return the assembled prompt, or null. */
  async function maybeRollTemplate(): Promise<string | null> {
    if (!pinnedTemplateId) return null;
    try {
      const bindings = useBlockTemplateStore.getState().draftCharacterBindings;
      const hasBindings = Object.keys(bindings).length > 0;
      const result = await rollTemplate(pinnedTemplateId, {
        character_bindings: hasBindings ? bindings : undefined,
      });
      return result?.success ? result.assembled_prompt : null;
    } catch {
      logEvent('WARN', 'template_roll_failed', { templateId: pinnedTemplateId });
      return null;
    }
  }

  /** Build and validate a generation request, resolving the effective operation type */
  function buildRequest(
    dynamicParams: Record<string, any>,
    operationInputs: any[],
    currentInput: any,
    overrides?: { activeAsset?: ReturnType<typeof toSelectedAsset>; promptOverride?: string | null },
  ): { error: string } | { finalPrompt: string; params: any; effectiveOperationType: string } {
    // Resolve prompt limit so buildGenerationRequest can clamp the prompt
    const opSpec = providerCapabilityRegistry.getOperationSpec(providerId ?? '', operationType);
    const maxChars = resolvePromptLimitForModel(providerId, dynamicParams?.model as string | undefined, opSpec?.parameters);

    const buildResult = buildGenerationRequest({
      operationType,
      prompt: overrides?.promptOverride ?? prompt,
      dynamicParams,
      operationInputs,
      prompts: bindings.prompts,
      transitionDurations: bindings.transitionDurations,
      activeAsset: overrides?.activeAsset ?? bindings.lastSelectedAsset,
      currentInput,
      maxChars,
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

  function withServerTemplateRollRunContext(
    runContext?: GenerationRunContext,
  ): GenerationRunContext | undefined {
    if (!runContext || !pinnedTemplateId || templateRollMode !== 'each') {
      return runContext;
    }
    const draftBindings = useBlockTemplateStore.getState().draftCharacterBindings;
    const hasBindings = Object.keys(draftBindings).length > 0;
    return {
      ...runContext,
      block_template_id: pinnedTemplateId,
      ...(hasBindings ? { character_bindings: draftBindings } : {}),
    };
  }

  /** Submit a single generation to the API and seed the generations store */
  async function submitOne(
    request: { finalPrompt: string; params: any; effectiveOperationType: string },
    runContext?: GenerationRunContext,
  ) {
    const result = await generateAsset({
      prompt: request.finalPrompt,
      providerId,
      operationType: request.effectiveOperationType,
      extraParams: request.params,
      runContext: withServerTemplateRollRunContext(runContext),
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

  async function generate(options?: { overrideDynamicParams?: Record<string, any>; overrideOperationInputs?: any[] }) {
    resetForGeneration();

    try {
      const { currentInputs, currentInput, transitionInputs } = getInputState();
      const effectiveInputs = options?.overrideOperationInputs ?? currentInputs;
      const dynamicParams = { ...bindings.dynamicParams, ...options?.overrideDynamicParams };

      await applyFrameExtraction(dynamicParams, currentInput, transitionInputs);

      // Template handling:
      // - 'each' mode: backend rolls per request using run_context
      // - 'once' mode: roll once client-side and pass prompt override
      const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
      const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;
      const request = buildRequest(dynamicParams, effectiveInputs, currentInput, { promptOverride: rolledOnce });
      if ('error' in request) {
        setError(request.error);
        setGenerating(false);
        return;
      }

      const run = createGenerationRunDescriptor({
        mode: 'quickgen_single',
      });
      const genId = await submitOne(
        request,
        createGenerationRunItemContext(run, {
          itemIndex: 0,
          itemTotal: 1,
          inputAssetIds: extractInputAssetIds(effectiveInputs),
        }),
      );
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
    const run = createGenerationRunDescriptor({ mode: 'quickgen_burst' });
    setQueueProgress({ queued: 0, total });

    try {
      const { currentInputs, currentInput, transitionInputs } = getInputState();
      const dynamicParams = { ...bindings.dynamicParams, ...options?.overrideDynamicParams };

      await applyFrameExtraction(dynamicParams, currentInput, transitionInputs);

      // Template handling:
      // - 'each' mode: backend rolls per request using run_context
      // - 'once' mode: roll once client-side, pass prompt override for all items
      const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
      const rollOnce = !useServerRolling ? await maybeRollTemplate() : null;
      const baseRequest = buildRequest(dynamicParams, currentInputs, currentInput, { promptOverride: rollOnce });
      if ('error' in baseRequest) {
        setError(baseRequest.error);
        setGenerating(false);
        setQueueProgress(null);
        return;
      }

      recordInputHistory(operationType, currentInputs);

      for (let i = 0; i < count; i++) {
        try {
          const genId = await submitOne(
            baseRequest,
            createGenerationRunItemContext(run, {
              itemIndex: i,
              itemTotal: total,
            }),
          );
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
    pinnedTemplateId,
    templateRollMode,
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
   * Generate individually for each queued input asset (or group of assets
   * when a combination strategy is selected).
   * Same prompt and settings, but one generation per group.
   *
   * When a set strategy + setId is provided, resolves the asset set and
   * uses computeSetCombinations instead of computeCombinations.
   */
  const generateEach = useCallback(async (options?: {
    overrideDynamicParams?: Record<string, any>;
    strategy?: CombinationStrategy;
    setId?: string;
  }) => {
    const { currentInputs } = getInputState();
    const strategy = options?.strategy ?? 'each';
    const run = createGenerationRunDescriptor({
      mode: 'quickgen_each',
      strategy,
      setId: options?.setId,
    });

    // ─── Set strategy path ───
    if (isSetStrategy(strategy) && options?.setId) {
      const assetSet = useAssetSetStore.getState().getSet(options.setId);
      if (!assetSet) {
        setError('Asset set not found');
        return;
      }

      resetForGeneration();

      try {
        const resolvedAssets = await resolveAssetSet(assetSet);
        if (resolvedAssets.length === 0) {
          setError('Asset set is empty — no assets could be resolved');
          setGenerating(false);
          return;
        }

        const setInputItems = assetModelsToInputItems(resolvedAssets);
        const groups = computeSetCombinations(currentInputs, setInputItems, strategy);

        const total = groups.length;
        if (total === 0) {
          setError('No valid combinations for selected set strategy');
          setGenerating(false);
          return;
        }
        let queued = 0;
        const generatedIds: number[] = [];
        setQueueProgress({ queued: 0, total });

        const overrideParams = options?.overrideDynamicParams || {};

        // Template handling:
        // - 'each' mode: backend rolls per request using run_context
        // - 'once' mode: roll once client-side, pass prompt override for all items
        const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
        const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;

        for (let i = 0; i < groups.length; i++) {
          const group = groups[i];
          const primaryInput = group[0];

          try {
            const dynamicParams = { ...bindings.dynamicParams, ...overrideParams };
            await applyFrameExtraction(dynamicParams, primaryInput, []);

            const request = buildRequest(dynamicParams, group, primaryInput, { promptOverride: rolledOnce });
            if ('error' in request) {
              logEvent('ERROR', 'generate_each_item_skipped', {
                index: i,
                strategy,
                error: request.error,
              });
              continue;
            }

            const genId = await submitOne(
              request,
              createGenerationRunItemContext(run, {
                itemIndex: i,
                itemTotal: total,
                inputAssetIds: extractInputAssetIds(group),
              }),
            );
            generatedIds.push(genId);
            queued++;
            setQueueProgress({ queued, total });
            recordInputHistory(operationType, group);

            logEvent('INFO', 'generate_each_created', {
              generationId: genId,
              operationType,
              providerId: providerId || 'pixverse',
              strategy,
              setId: options.setId,
              eachIndex: i + 1,
              eachTotal: total,
            });
          } catch (itemErr) {
            logEvent('ERROR', 'generate_each_item_failed', {
              eachIndex: i + 1,
              strategy,
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
          strategy,
          setId: options.setId,
          operationType,
          providerId: providerId || 'pixverse',
        });
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to queue set generations'));
      } finally {
        setGenerating(false);
        setTimeout(() => setQueueProgress(null), 2000);
      }
      return;
    }

    // ─── Standard input strategy path ───
    const groups = computeCombinations(currentInputs, strategy as EachStrategy);
    if (groups.length === 0) {
      setError('No queued inputs to generate');
      return;
    }

    resetForGeneration();
    const total = groups.length;
    let queued = 0;
    const generatedIds: number[] = [];
    setQueueProgress({ queued: 0, total });

    try {
      const overrideParams = options?.overrideDynamicParams || {};

      // Template handling:
      // - 'each' mode: backend rolls per request using run_context
      // - 'once' mode: roll once client-side, pass prompt override for all items
      const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
      const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        // For single-item groups use the item as currentInput; for multi-item groups use the first
        const primaryInput = group[0];

        try {
          const dynamicParams = { ...bindings.dynamicParams, ...overrideParams };
          await applyFrameExtraction(dynamicParams, primaryInput, []);

          const request = buildRequest(dynamicParams, group, primaryInput, { promptOverride: rolledOnce });
          if ('error' in request) {
            logEvent('ERROR', 'generate_each_item_skipped', {
              index: i,
              strategy,
              error: request.error,
            });
            continue;
          }

          const genId = await submitOne(
            request,
            createGenerationRunItemContext(run, {
              itemIndex: i,
              itemTotal: total,
              inputAssetIds: extractInputAssetIds(group),
            }),
          );
          generatedIds.push(genId);
          queued++;
          setQueueProgress({ queued, total });
          recordInputHistory(operationType, group);

          logEvent('INFO', 'generate_each_created', {
            generationId: genId,
            operationType,
            providerId: providerId || 'pixverse',
            strategy,
            eachIndex: i + 1,
            eachTotal: total,
          });
        } catch (itemErr) {
          logEvent('ERROR', 'generate_each_item_failed', {
            eachIndex: i + 1,
            strategy,
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
        strategy,
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
    pinnedTemplateId,
    templateRollMode,
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
   * Generate using current settings with a specific asset as sole input.
   * Used by media card quick-generate buttons to delegate to the controller
   * instead of duplicating the generation logic.
   *
   * When count > 1, submits multiple generations (burst mode) using the asset.
   */
  async function generateWithAsset(asset: AssetModel, count?: number, overrides?: { duration?: number }) {
    resetForGeneration();

    const burstCount = count && count > 1 ? count : 1;

    try {
      const dynamicParams = { ...bindings.dynamicParams };

      // Merge gesture-driven overrides (e.g., duration from secondary axis)
      if (overrides?.duration !== undefined) {
        dynamicParams.duration = overrides.duration;
      }

      // Create an InputItem for the asset
      const inputItem = {
        id: `quick-${asset.id}-${Date.now()}`,
        asset,
        queuedAt: new Date().toISOString(),
        lockedTimestamp: undefined,
      };

      await applyFrameExtraction(dynamicParams, inputItem, []);

      // Match main Quick Generate behavior:
      // - 'each' mode: backend rolls per request via run_context in submitOne()
      // - 'once' mode: roll once client-side and use prompt override
      const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
      const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;

      const request = buildRequest(
        dynamicParams,
        [inputItem],
        inputItem,
        {
          activeAsset: toSelectedAsset(asset, 'gallery'),
          promptOverride: rolledOnce,
        },
      );
      if ('error' in request) {
        setError(request.error);
        return;
      }

      const isBurst = burstCount > 1;
      const run = createGenerationRunDescriptor({
        mode: isBurst ? 'quickgen_burst' : 'quickgen_single',
        metadata: {
          source: 'generateWithAsset',
        },
      });

      if (isBurst) {
        const generatedIds: number[] = [];
        setQueueProgress({ queued: 0, total: burstCount });

        for (let i = 0; i < burstCount; i++) {
          try {
            const genId = await submitOne(
              request,
              createGenerationRunItemContext(run, {
                itemIndex: i,
                itemTotal: burstCount,
                inputAssetIds: [asset.id],
              }),
            );
            generatedIds.push(genId);
            setQueueProgress({ queued: generatedIds.length, total: burstCount });

            logEvent('INFO', 'burst_generation_created', {
              generationId: genId,
              operationType,
              providerId: providerId || 'pixverse',
              burstIndex: i + 1,
              burstTotal: burstCount,
              source: 'generateWithAsset',
            });
          } catch (itemErr) {
            logEvent('ERROR', 'burst_item_failed', {
              burstIndex: i + 1,
              error: extractErrorMessage(itemErr, 'Unknown error'),
              source: 'generateWithAsset',
            });
          }
        }

        if (generatedIds.length > 0) {
          const lastId = generatedIds[generatedIds.length - 1];
          setGenerationId(lastId);
          setWatchingGeneration(lastId);
        }
        recordInputHistory(operationType, [inputItem]);
        setTimeout(() => setQueueProgress(null), 2000);
      } else {
        const genId = await submitOne(
          request,
          createGenerationRunItemContext(run, {
            itemIndex: 0,
            itemTotal: 1,
            inputAssetIds: [asset.id],
          }),
        );
        setGenerationId(genId);
        setWatchingGeneration(genId);
        recordInputHistory(operationType, [inputItem]);

        logEvent('INFO', 'generation_created', {
          generationId: genId,
          operationType,
          providerId: providerId || 'pixverse',
          status: 'pending',
          source: 'generateWithAsset',
        });
      }
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
    generateWithAsset,
    generateBurst,
    generateEach,
  };
}
