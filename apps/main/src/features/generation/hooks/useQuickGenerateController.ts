import { useState, useEffect, useRef, useCallback } from 'react';

import { rollTemplate } from '@lib/api/blockTemplates';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { logEvent } from '@lib/utils/logging';

import { extractFrame, fromAssetResponse, getAssetDisplayUrls, toSelectedAsset, type AssetModel } from '@features/assets';
import { resolveAssetSet, assetModelsToInputItems } from '@features/assets/lib/assetSetResolver';
import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import { useGenerationsStore, createPendingGeneration } from '@features/generation';
import { useGenerationScopeStores } from '@features/generation';
import { generateAsset, prepareGenerateAssetSubmission } from '@features/generation/lib/api';
import { useQuickGenerateBindings } from '@features/prompts';
import { useBlockTemplateStore } from '@features/prompts/stores/blockTemplateStore';
import { providerCapabilityRegistry } from '@features/providers';

import { resolveMaxSlotsFromSpecs, resolveMaxSlotsForModel } from '@/components/media/SlotPicker';
import { getFallbackOperation } from '@/types/operations';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';



import { isSetStrategy, type CombinationStrategy } from '../lib/combinationStrategies';
import {
  executeTrackedEachBackendExecution,
  prepareEachBackendExecutionPayload,
} from '../lib/eachBackendExecution';
import { prepareEachExecutionItems } from '../lib/eachExecutionItems';
import { planFanoutGroups } from '../lib/fanoutPlanner';
import {
  normalizeFanoutRunOptions,
  type FanoutRunOptions,
} from '../lib/fanoutPresets';
import { pickFromSet } from '../lib/pickFromSet';
import { buildGenerationRequest, type PickStateUpdate } from '../lib/quickGenerateLogic';
import { createGenerationRunDescriptor, createGenerationRunItemContext, type GenerationRunContext } from '../lib/runContext';
import { executeSequentialSteps, createSequentialStepRunContextMetadata } from '../lib/sequentialExecutor';
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
  // Sync pinned template per-operation (same pattern as promptPerOperation in session store)
  useEffect(() => {
    useBlockTemplateStore.getState().syncOperation(operationType);
  }, [operationType]);
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

  /** Roll the pinned template (if any) and return the assembled prompt.
   *  Throws on failure so the caller can show a visible error instead of
   *  silently falling back to the manual prompt. */
  async function maybeRollTemplate(): Promise<string | null> {
    if (!pinnedTemplateId) return null;
    const { draftCharacterBindings: bindings, controlValues } = useBlockTemplateStore.getState();
    const hasBindings = Object.keys(bindings).length > 0;
    const hasControlOverrides = Object.keys(controlValues).length > 0;
    const result = await rollTemplate(pinnedTemplateId, {
      character_bindings: hasBindings ? bindings : undefined,
      control_values: hasControlOverrides ? controlValues : undefined,
    });
    if (!result?.success) {
      const warnings = result?.warnings?.length ? `: ${result.warnings.join(', ')}` : '';
      throw new Error(`Template roll failed${warnings}`);
    }
    return result.assembled_prompt;
  }

  /** Build and validate a generation request, resolving the effective operation type */
  async function buildRequest(
    dynamicParams: Record<string, any>,
    operationInputs: any[],
    currentInput: any,
    overrides?: { activeAsset?: ReturnType<typeof toSelectedAsset> | null; promptOverride?: string | null },
  ): Promise<{ error: string } | { finalPrompt: string; params: any; effectiveOperationType: string; pickStateUpdates?: PickStateUpdate[] }> {
    // Resolve prompt limit so buildGenerationRequest can clamp the prompt
    const opSpec = providerCapabilityRegistry.getOperationSpec(providerId ?? '', operationType);
    const model = dynamicParams?.model as string | undefined;
    const maxChars = resolvePromptLimitForModel(providerId, model, opSpec?.parameters);

    // Clamp inputs to the model's max slot limit so we never send more assets than allowed
    const maxSlots = resolveMaxSlotsFromSpecs(opSpec?.parameters, operationType, model)
      ?? resolveMaxSlotsForModel(operationType, model);
    const clampedInputs = operationInputs.length > maxSlots
      ? operationInputs.slice(0, maxSlots)
      : operationInputs;

    // activeAsset: null means explicitly skip gallery fallback (e.g. empty carousel slot).
    // undefined means "not provided" → use gallery fallback.
    const resolvedActiveAsset = overrides && 'activeAsset' in overrides
      ? overrides.activeAsset ?? undefined
      : bindings.lastSelectedAsset;

    const buildResult = await buildGenerationRequest({
      operationType,
      prompt: overrides?.promptOverride ?? prompt,
      dynamicParams,
      operationInputs: clampedInputs,
      prompts: bindings.prompts,
      transitionDurations: bindings.transitionDurations,
      activeAsset: resolvedActiveAsset,
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
      pickStateUpdates: buildResult.pickStateUpdates,
    };
  }

  /** Persist pick state updates (sequential index / no_repeat history) and update display assets */
  function applyPickStateUpdates(updates: PickStateUpdate[] | undefined) {
    if (!updates || updates.length === 0) return;
    const inputStore = (useInputStore as any).getState();
    for (const update of updates) {
      // Persist strategy state
      inputStore.updatePickState(operationType, update.inputId, {
        pickIndex: update.pickIndex,
        recentPicks: update.recentPicks,
      });

      // Update display asset to show the picked asset
      const state = (useInputStore as any).getState();
      const existing = state.inputsByOperation?.[operationType];
      if (existing) {
        const item = existing.items.find((i: any) => i.id === update.inputId);
        if (item && item.asset.id !== update.pickedAssetId) {
          // Only update if the picked asset differs from display
          // We don't have the full AssetModel here, but the composition_assets
          // already used the correct asset for generation. The display will
          // show the picked asset id which is enough for the badge/tooltip.
          // The full asset model will be fetched if needed by hydration.
          (useInputStore as any).setState({
            inputsByOperation: {
              ...state.inputsByOperation,
              [operationType]: {
                ...existing,
                items: existing.items.map((i: any) =>
                  i.id === update.inputId
                    ? { ...i, asset: { ...i.asset, id: update.pickedAssetId } }
                    : i,
                ),
              },
            },
          });
        }
      }
    }
  }

  /**
   * Resolve all unique asset sets referenced by inputs ONCE, returning a cache.
   * Prevents N×M API calls when buildRequest is called per group/burst item.
   */
  async function preResolveSetRefs(inputs: any[]): Promise<Map<string, AssetModel[]>> {
    const cache = new Map<string, AssetModel[]>();
    const setIds = new Set<string>();
    for (const item of inputs) {
      const ref = item?.assetSetRef;
      if (ref?.setId && !setIds.has(ref.setId)) {
        setIds.add(ref.setId);
      }
    }
    for (const setId of setIds) {
      const set = useAssetSetStore.getState().getSet(setId);
      if (set) {
        try {
          cache.set(setId, await resolveAssetSet(set));
        } catch {
          console.warn(`[preResolveSetRefs] Failed to resolve set "${setId}"`);
        }
      }
    }
    return cache;
  }

  /**
   * Replace assetSetRef on inputs with a concrete pre-picked asset using
   * the cached resolved sets. Returns new input array (does not mutate).
   */
  function prePickSetRefs(inputs: any[], cache: Map<string, AssetModel[]>): any[] {
    if (cache.size === 0) return inputs;
    return inputs.map((item: any) => {
      const ref = item?.assetSetRef;
      if (!ref || ref.mode !== 'random_each') return item;
      const setAssets = cache.get(ref.setId);
      if (!setAssets || setAssets.length === 0) return item;
      const { asset } = pickFromSet(setAssets, ref.pickStrategy, ref);
      return { ...item, asset, assetSetRef: undefined };
    });
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

  async function submitEachViaBackendExecution(args: {
    groups: any[][];
    total: number;
    run: any;
    strategy: CombinationStrategy;
    setId?: string;
    overrideParams: Record<string, any>;
    rolledOnce: string | null;
    onError: 'continue' | 'stop';
    executionMode: FanoutRunOptions['executionMode'];
    reusePreviousOutputAsInput: boolean;
  }) {
    const {
      groups,
      total,
      run,
      strategy,
      setId,
      overrideParams,
      rolledOnce,
      onError,
      executionMode,
      reusePreviousOutputAsInput,
    } = args;
    // Pre-resolve all referenced asset sets ONCE so buildRequest doesn't
    // re-resolve per group (avoids N×M sequential API calls during preparation).
    const allGroupItems = groups.flat();
    const setCache = await preResolveSetRefs(allGroupItems);

    const itemPayloads = await prepareEachExecutionItems({
      groups,
      total,
      strategy,
      onError,
      emptyErrorMessage: `No valid items could be prepared for backend ${executionMode === 'sequential' ? 'sequential Each' : 'fanout'}`,
      prepareItem: async ({ index: i, total, group, primaryInput }) => {
        const resolvedGroup = prePickSetRefs(group, setCache);
        const resolvedPrimary = resolvedGroup[0] ?? primaryInput;
        const dynamicParams = { ...bindings.dynamicParams, ...overrideParams };
        await applyFrameExtraction(dynamicParams, resolvedPrimary, []);
        const request = await buildRequest(dynamicParams, resolvedGroup, resolvedPrimary, { promptOverride: rolledOnce });
        if ('error' in request) {
          return { kind: 'skip', reason: request.error };
        }
        const runContext = createGenerationRunItemContext(run, {
          itemIndex: i,
          itemTotal: total,
          inputAssetIds: extractInputAssetIds(group),
        });
        const prepared = prepareGenerateAssetSubmission({
          prompt: request.finalPrompt,
          providerId,
          operationType: request.effectiveOperationType,
          extraParams: request.params,
          runContext: withServerTemplateRollRunContext(runContext),
        });
        return {
          kind: 'item',
          item: {
          id: `item_${i}`,
          label: `Each ${i + 1}/${total}`,
          params: prepared.generationParams,
          operation: prepared.generationType,
          provider_id: prepared.providerId,
          ...(prepared.preferredAccountId ? { preferred_account_id: prepared.preferredAccountId } : {}),
          name: prepared.name,
          priority: prepared.priority,
          force_new: true,
          ...(executionMode === 'sequential' && reusePreviousOutputAsInput && i > 0
            ? { use_previous_output_as_input: true }
            : {}),
          },
        };
      },
      onItemSkipped: ({ index: i }, reason) => {
        logEvent('ERROR', 'generate_each_item_skipped', {
          index: i,
          strategy,
          error: reason,
          transport: 'backend_fanout',
        });
      },
      onItemPrepareFailed: ({ index: i }, itemErr) => {
        logEvent('ERROR', 'generate_each_item_prepare_failed', {
          eachIndex: i + 1,
          strategy,
          error: extractErrorMessage(itemErr, 'Unknown error'),
          transport: 'backend_fanout',
        });
      },
    });

    const request = prepareEachBackendExecutionPayload({
      providerId: providerId || 'pixverse',
      strategy,
      setId,
      onError,
      executionMode,
      reusePreviousOutputAsInput,
      items: itemPayloads,
    });

    const { generationIds } = await executeTrackedEachBackendExecution({
      request,
      total,
      executionMode,
      onProgress: (progress) => setQueueProgress(progress),
    });

    for (const genId of generationIds) {
      addOrUpdateGeneration(createPendingGeneration({
        id: genId,
        operationType,
        providerId,
        finalPrompt: prompt,
        params: {},
        status: 'pending',
      }));
    }
    if (generationIds.length > 0) {
      const lastId = generationIds[generationIds.length - 1];
      setGenerationId(lastId);
      setWatchingGeneration(lastId);
    }
  }

  async function generate(options?: { overrideDynamicParams?: Record<string, any>; overrideOperationInputs?: any[]; skipActiveAssetFallback?: boolean; promptOverride?: string }) {
    resetForGeneration();

    try {
      const { currentInputs, currentInput, transitionInputs } = getInputState();
      const effectiveInputs = options?.overrideOperationInputs ?? currentInputs;
      const dynamicParams = { ...bindings.dynamicParams, ...options?.overrideDynamicParams };

      await applyFrameExtraction(dynamicParams, currentInput, transitionInputs);

      // Template handling:
      // - 'each' mode: backend rolls per request using run_context
      // - 'once' mode: roll once client-side and pass prompt override
      // Caller-provided promptOverride takes priority over template rolling.
      const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
      const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;
      const overrides: { activeAsset?: ReturnType<typeof toSelectedAsset> | null; promptOverride?: string | null } = {
        promptOverride: options?.promptOverride ?? rolledOnce,
      };
      if (options?.skipActiveAssetFallback) {
        overrides.activeAsset = null;
      }
      const request = await buildRequest(dynamicParams, effectiveInputs, currentInput, overrides);
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
      applyPickStateUpdates(request.pickStateUpdates);

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
  const generateBurst = useCallback(async (count: number, options?: { overrideDynamicParams?: Record<string, any>; overrideOperationInputs?: any[] }) => {
    if (count <= 1) return generate(options);

    resetForGeneration();
    const total = count;
    let queued = 0;
    const generatedIds: number[] = [];
    const run = createGenerationRunDescriptor({ mode: 'quickgen_burst' });
    setQueueProgress({ queued: 0, total });

    try {
      const { currentInputs, currentInput, transitionInputs } = getInputState();
      const effectiveInputs = options?.overrideOperationInputs ?? currentInputs;
      const effectiveCurrentInput = options?.overrideOperationInputs
        ? options.overrideOperationInputs[0] ?? currentInput
        : currentInput;
      const dynamicParams = { ...bindings.dynamicParams, ...options?.overrideDynamicParams };

      await applyFrameExtraction(dynamicParams, effectiveCurrentInput, transitionInputs);

      // Template handling:
      // - 'each' mode: backend rolls per request using run_context
      // - 'once' mode: roll once client-side, pass prompt override for all items
      const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
      const rollOnce = !useServerRolling ? await maybeRollTemplate() : null;
      // Pre-resolve sets once so burst iterations don't re-resolve per item
      const hasRandomEachRef = effectiveInputs.some(
        (item: any) => item.assetSetRef?.mode === 'random_each',
      );
      const setCache = hasRandomEachRef ? await preResolveSetRefs(effectiveInputs) : new Map<string, AssetModel[]>();

      // Build a base request for validation (and reuse when no random_each refs)
      const baseRequest = await buildRequest(dynamicParams, effectiveInputs, effectiveCurrentInput, { promptOverride: rollOnce });
      if ('error' in baseRequest) {
        setError(baseRequest.error);
        setGenerating(false);
        setQueueProgress(null);
        return;
      }

      recordInputHistory(operationType, effectiveInputs);

      for (let i = 0; i < count; i++) {
        try {
          // Bug 2 fix: when random_each refs exist, pre-pick from cached sets
          // so each burst item gets a fresh pick without re-resolving the set
          let request = baseRequest;
          if (hasRandomEachRef) {
            const pickedInputs = prePickSetRefs(effectiveInputs, setCache);
            const pickedCurrent = pickedInputs.find((item: any) => item.id === effectiveCurrentInput?.id) ?? effectiveCurrentInput;
            const freshRequest = await buildRequest(dynamicParams, pickedInputs, pickedCurrent, { promptOverride: rollOnce });
            if (!('error' in freshRequest)) {
              request = freshRequest;
            }
          }

          const genId = await submitOne(
            request,
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

      applyPickStateUpdates(baseRequest.pickStateUpdates);

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

  const generateSequentialBurst = useCallback(async (count: number, options?: { overrideDynamicParams?: Record<string, any> }) => {
    if (count <= 1) return generate(options);

    resetForGeneration();
    const total = count;
    const generatedIds: number[] = [];
    const run = createGenerationRunDescriptor({ mode: 'quickgen_burst' });
    setQueueProgress({ queued: 0, total });

    try {
      const { currentInputs, currentInput, transitionInputs } = getInputState();
      const baseDynamicParams = { ...bindings.dynamicParams, ...options?.overrideDynamicParams };

      await applyFrameExtraction(baseDynamicParams, currentInput, transitionInputs);

      const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
      const rollOnce = !useServerRolling ? await maybeRollTemplate() : null;

      recordInputHistory(operationType, currentInputs);

      // Pre-resolve sets once for step 1 (step 2+ uses previous output, no set refs)
      const hasRandomEachRef = currentInputs.some(
        (item: any) => item.assetSetRef?.mode === 'random_each',
      );
      const setCache = hasRandomEachRef ? await preResolveSetRefs(currentInputs) : new Map<string, AssetModel[]>();

      const result = await executeSequentialSteps({
        steps: Array.from({ length: count }, (_, i) => ({
          id: `burst_seq_${i + 1}`,
          label: `Burst Seq ${i + 1}/${count}`,
          metadata: { burstIndex: i, burstTotal: count },
        })),
        submitStep: async (context) => {
          const dynamicParams = { ...baseDynamicParams };
          let operationInputsForStep: any[] = currentInputs;
          let currentInputForStep: any = currentInput;

          // Sequential burst semantics: from step 2 onward, use previous output as the new source
          // for operations that consume a source asset (img2img/i2v/etc.). We force this by
          // overriding source asset params and clearing queued inputs so buildRequest prefers them.
          if (context.stepIndex > 0 && context.previousAssetId != null) {
            dynamicParams.source_asset_id = context.previousAssetId;
            delete dynamicParams.sourceAssetId;
            dynamicParams.source_asset_ids = [context.previousAssetId];
            delete dynamicParams.sourceAssetIds;
            delete dynamicParams.original_video_id;
            delete dynamicParams.composition_assets;
            operationInputsForStep = [];
            currentInputForStep = undefined;
          } else if (hasRandomEachRef) {
            // Step 1: pre-pick from cached sets to avoid re-resolving
            operationInputsForStep = prePickSetRefs(currentInputs, setCache);
            currentInputForStep = operationInputsForStep.find((item: any) => item.id === currentInput?.id) ?? currentInput;
          }

          const request = await buildRequest(
            dynamicParams,
            operationInputsForStep,
            currentInputForStep,
            { promptOverride: rollOnce },
          );
          if ('error' in request) {
            throw new Error(request.error);
          }

          const genId = await submitOne(
            request,
            createGenerationRunItemContext(run, {
              itemIndex: context.stepIndex,
              itemTotal: total,
              metadata: createSequentialStepRunContextMetadata({
                stepId: context.step.id,
                stepIndex: context.stepIndex,
                stepTotal: context.stepTotal,
                sourceGenerationId: context.previousGenerationId,
                sourceAssetId: context.previousAssetId,
                metadata: {
                  run_mode: 'quickgen_burst_sequential',
                  chain_previous_output: true,
                },
              }),
            }),
          );
          generatedIds.push(genId);
          return { generationId: genId };
        },
        onStepUpdate: (record) => {
          const completed = generatedIds.length;
          if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled' || record.status === 'timeout') {
            setQueueProgress({ queued: completed, total });
          }
        },
        continueOnFailure: false,
      });

      if (generatedIds.length > 0) {
        const lastId = generatedIds[generatedIds.length - 1];
        setGenerationId(lastId);
        setWatchingGeneration(lastId);
      }

      if (result.status !== 'completed') {
        const failed = result.failedStepIndex != null ? result.failedStepIndex + 1 : null;
        setError(failed ? `Sequential burst stopped at step ${failed}/${count}` : 'Sequential burst failed');
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to run sequential burst'));
    } finally {
      setGenerating(false);
      setTimeout(() => setQueueProgress(null), 2000);
    }
  }, [
    generate,
    operationType,
    pinnedTemplateId,
    templateRollMode,
    bindings.dynamicParams,
    useInputStore,
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
    fanoutOptions?: Partial<FanoutRunOptions>;
  }) => {
    const { currentInputs } = getInputState();
    const fanout = normalizeFanoutRunOptions({
      strategy: options?.strategy,
      setId: options?.setId,
      ...(options?.fanoutOptions || {}),
    });
    const strategy = fanout.strategy;
    const run = createGenerationRunDescriptor({
      mode: 'quickgen_each',
      strategy,
      setId: fanout.setId,
      metadata: {
        repeat_count: fanout.repeatCount,
        dispatch: fanout.dispatch,
        on_error: fanout.onError,
        execution_mode: fanout.executionMode,
        reuse_previous_output_as_input: fanout.reusePreviousOutputAsInput,
      },
    });

    // ─── Set strategy path ───
    if (isSetStrategy(strategy) && fanout.setId) {
      const assetSet = useAssetSetStore.getState().getSet(fanout.setId);
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

        const planning = planFanoutGroups({
          inputs: currentInputs,
          options: fanout,
          setItems: assetModelsToInputItems(resolvedAssets),
        });
        const groups = planning.groups;

        const total = groups.length;
        if (total === 0) {
          setError('No valid combinations for selected set strategy');
          setGenerating(false);
          return;
        }
        setQueueProgress({ queued: 0, total });

        const overrideParams = options?.overrideDynamicParams || {};

        // Template handling:
        // - 'each' mode: backend rolls per request using run_context
        // - 'once' mode: roll once client-side, pass prompt override for all items
        const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
        const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;
        await submitEachViaBackendExecution({
          groups,
          total,
          run,
          strategy,
          setId: fanout.setId,
          overrideParams,
          rolledOnce,
          onError: fanout.onError,
          executionMode: fanout.executionMode,
          reusePreviousOutputAsInput: fanout.reusePreviousOutputAsInput,
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
    const groups = planFanoutGroups({
      inputs: currentInputs,
      options: fanout,
    }).groups;
    if (groups.length === 0) {
      setError('No queued inputs to generate');
      return;
    }

    resetForGeneration();
    const total = groups.length;
    setQueueProgress({ queued: 0, total });

    try {
      const overrideParams = options?.overrideDynamicParams || {};

      // Template handling:
      // - 'each' mode: backend rolls per request using run_context
      // - 'once' mode: roll once client-side, pass prompt override for all items
      const useServerRolling = pinnedTemplateId && templateRollMode === 'each';
      const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;
      await submitEachViaBackendExecution({
        groups,
        total,
        run,
        strategy,
        overrideParams,
        rolledOnce,
        onError: fanout.onError,
        executionMode: fanout.executionMode,
        reusePreviousOutputAsInput: fanout.reusePreviousOutputAsInput,
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

      const request = await buildRequest(
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

  /** Generate using only the currently selected carousel input (ignores other queued inputs). */
  async function generateCurrentOnly(count?: number) {
    const { currentInput } = getInputState();
    if (!currentInput) {
      // Empty carousel slot: skip activeAsset fallback so text-to-* kicks in
      return generate({ skipActiveAssetFallback: true });
    }
    const inputOverride = [currentInput];
    if (count && count > 1) {
      return generateBurst(count, { overrideOperationInputs: inputOverride });
    }
    return generate({ overrideOperationInputs: inputOverride });
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
    generateCurrentOnly,
    generateWithAsset,
    generateBurst,
    generateSequentialBurst,
    generateEach,
  };
}
