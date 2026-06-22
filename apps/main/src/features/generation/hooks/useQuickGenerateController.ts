import { createContext, createElement, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';

import { rollTemplate } from '@lib/api/blockTemplates';
import { extractErrorMessage } from '@lib/api/errorHandling';
import { logEvent } from '@lib/utils/logging';

import { extractFrame, fromAssetResponse, getAssetDisplayUrls, toSelectedAsset, type AssetModel } from '@features/assets';
import { resolveAssetSet } from '@features/assets/lib/assetSetResolver';
import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import type { GenerateOverrides } from '@features/contextHub';
import { useGenerationsStore, createPendingGeneration } from '@features/generation';
import { useGenerationScopeStores, usePersistedScopeState } from '@features/generation';
import { generateAsset, prepareGenerateAssetSubmission } from '@features/generation/lib/api';
import { useQuickGenerateBindings } from '@features/prompts';
import { useBlockTemplateStore } from '@features/prompts/stores/blockTemplateStore';
import { providerCapabilityRegistry } from '@features/providers';

import { resolveMaxSlotsFromSpecs, resolveMaxSlotsForModel } from '@/components/media/SlotPicker';
import { getFallbackOperation, OPERATION_METADATA, type OperationType } from '@/types/operations';
import { resolvePromptLimitForModel } from '@/utils/prompt/limits';



import { computeCombinations, type CombinationStrategy, type EachStrategy } from '../lib/combinationStrategies';
import { prepareEachBackendExecutionPayload } from '../lib/eachBackendExecution';
import { prepareEachExecutionItems } from '../lib/eachExecutionItems';
import { ensureInputsUploaded } from '../lib/ensureInputsUploaded';
import { planFanoutGroups } from '../lib/fanoutPlanner';
import {
  expandGroupsByRepeat,
  normalizeFanoutRunOptions,
  randomForFanoutSeed,
  type FanoutRunOptions,
} from '../lib/fanoutPresets';
import { pickFromSet } from '../lib/pickFromSet';
import { buildGenerationRequest, type PickStateUpdate } from '../lib/quickGenerateLogic';
import {
  dispatchRawItemBackendExecution,
  trackRawItemBackendExecution,
} from '../lib/rawItemBackendExecution';
import {
  createGenerationRunDescriptor,
  createGenerationRunItemContext,
  PROMPT_TOOL_RUN_CONTEXT_PATCH_KEY,
  type GenerationRunContext,
  type InputProvenanceEntry,
  type PromptToolRunContextPatch,
} from '../lib/runContext';
import { executeSequentialSteps, createSequentialStepRunContextMetadata } from '../lib/sequentialExecutor';
import { useGenerationHistoryStore } from '../stores/generationHistoryStore';
import { useGenerationInputStore, getPinnedPrompt } from '../stores/generationInputStore';
import { useGenerationPresetStore } from '../stores/generationPresetStore';
import { getRegisteredInputStores } from '../stores/generationScopeStores';

/** Result of the generation pipeline (no widget state side-effects). */
export interface GenerationPipelineResult {
  generationIds: number[];
  pickStateUpdates?: PickStateUpdate[];
}

/** Throw if the extracted frame failed to upload to any provider (no usable provider_uploads). */
function assertFrameUploadSucceeded(frame: AssetModel) {
  const statuses = frame.lastUploadStatusByProvider;
  const hasUploadError = statuses && Object.values(statuses).some(s => s === 'error');
  const hasSuccessfulUpload = frame.providerUploads && Object.keys(frame.providerUploads).length > 0;
  if (hasUploadError && !hasSuccessfulUpload) {
    throw new Error('Frame extracted but upload to provider failed. The frame cannot be used for generation until it is uploaded — try re-uploading from the gallery.');
  }
}

interface HistoryAsset {
  id: number;
  thumbnailUrl: string;
  mediaType: string | undefined;
}

/** Derive HistoryAsset[] from input items (used by buildRequest to stamp onto its result). */
function buildHistoryAssets(inputs: any[]): HistoryAsset[] {
  return inputs
    .filter((item: any) => item?.asset)
    .map((item: any) => {
      const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(item.asset);
      return {
        id: item.asset.id,
        thumbnailUrl: thumbnailUrl || previewUrl || mainUrl || '',
        mediaType: item.asset.mediaType,
      };
    });
}

/** Record pre-built history assets against an operation type. */
function recordInputHistory(operationType: string, assets: HistoryAsset[]) {
  if (assets.length > 0) {
    useGenerationHistoryStore.getState().recordUsage(operationType, assets);
  }
}

/** Probe param-source modes (persisted per scope×op as `probeParamSource:<op>`).
 *  - 'asSet'  → run the user's current settings as-is, no overrides (default).
 *  - 'cheap'  → apply cheap clamp (video duration=5) so probes stay fast.
 *  - <preset id> → cheap clamp + that preset's params on top. */
export const PROBE_AS_SET = 'asSet';
export const PROBE_CHEAP = 'cheap';
/** True when the source string is a bound preset id (not a built-in mode). */
export function isProbePresetSource(src: string | null | undefined): boolean {
  return !!src && src !== PROBE_AS_SET && src !== PROBE_CHEAP;
}

/** Cheap param clamp for probe runs. Keeps probes cheap and fast: video ops are
 *  clamped to duration=5. video_transition is skipped because its top-level
 *  `duration` is hidden (per-segment durations drive the total). Image ops get
 *  no override. */
function getProbeParamOverrides(operationType: OperationType): Record<string, any> {
  const meta = OPERATION_METADATA[operationType];
  if (!meta || meta.outputType !== 'video') return {};
  if (meta.hiddenParams?.includes('duration')) return {};
  return { duration: 5 };
}

/** Resolve the cheap-default clamp honoring the probe param-source mode. In
 *  'asSet' mode there is NO clamp — the user's current settings run verbatim.
 *  'cheap' and bound-preset modes still get the duration=5 base. */
export function resolveProbeCheapDefaults(
  operationType: OperationType,
  source: string | null | undefined,
): Record<string, any> {
  if (source === PROBE_AS_SET) return {};
  return getProbeParamOverrides(operationType);
}

/** Clamp inputs to the operation's max slot limit so request + tracking agree. */
function clampInputsToMaxSlots<T extends any[]>(
  inputs: T,
  operationType: OperationType,
  model: string | undefined,
  providerId: string | undefined,
): T {
  const opSpec = providerCapabilityRegistry.getOperationSpec(providerId ?? '', operationType);
  const maxSlots = resolveMaxSlotsFromSpecs(opSpec?.parameters, operationType, model)
    ?? resolveMaxSlotsForModel(operationType, model);
  return (inputs.length > maxSlots ? inputs.slice(0, maxSlots) : inputs) as T;
}

/**
 * Merge dynamic params in canonical precedence (low→high):
 * shared bindings < probe cheap defaults < per-input overrides < caller overrides.
 * Centralizes the order so the single/burst/Each/sequential paths can't drift.
 * Plan: per-input-param-override.
 */
function buildDynamicParams(
  shared: Record<string, any> | undefined,
  probeDefaults: Record<string, any> | null | undefined,
  perInputOverrides: Record<string, any> | undefined,
  callerOverrides: Record<string, any> | undefined,
): Record<string, any> {
  return {
    ...shared,
    ...(probeDefaults || {}),
    ...perInputOverrides,
    ...callerOverrides,
  };
}

/**
 * Drop persisted source/composition asset params so explicitly-provided (or
 * single-slot-clamped) inputs aren't overridden by stale store values. Note:
 * the sequential output-chaining path deliberately does NOT use this — it
 * *sets* source_asset_id(s) and clears legacy aliases, a different contract.
 */
function clearSourceAssetParams(params: Record<string, any>): void {
  delete params.source_asset_id;
  delete params.source_asset_ids;
  delete params.composition_assets;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRecordList(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.filter(isRecord).map((row) => ({ ...row }));
  return rows.length > 0 ? rows : undefined;
}

function normalizePromptToolRunContextPatch(value: unknown): PromptToolRunContextPatch | null {
  if (!isRecord(value)) return null;
  const guidancePatch = isRecord(value.guidance_patch)
    ? ({ ...value.guidance_patch } as Record<string, unknown>)
    : undefined;
  const compositionAssetsPatch = normalizeRecordList(value.composition_assets_patch);
  if (!guidancePatch && !compositionAssetsPatch) return null;
  return {
    ...(guidancePatch ? { guidance_patch: guidancePatch } : {}),
    ...(compositionAssetsPatch ? { composition_assets_patch: compositionAssetsPatch } : {}),
  };
}

function deepMergeRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const currentValue = merged[key];
    if (isRecord(currentValue) && isRecord(value)) {
      merged[key] = deepMergeRecords(currentValue, value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function mergeCompositionAssetsPatch(
  base: Array<Record<string, unknown>>,
  patch: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged = [...base];
  for (const row of patch) {
    const patchAssetId = row.asset_id;
    const patchAssetKey = (
      typeof patchAssetId === 'string' || typeof patchAssetId === 'number'
    )
      ? String(patchAssetId)
      : null;
    if (!patchAssetKey) {
      merged.push(row);
      continue;
    }

    const existingIndex = merged.findIndex((entry) => {
      const existingAssetId = entry.asset_id;
      if (typeof existingAssetId !== 'string' && typeof existingAssetId !== 'number') {
        return false;
      }
      return String(existingAssetId) === patchAssetKey;
    });
    if (existingIndex < 0) {
      merged.push(row);
      continue;
    }
    merged[existingIndex] = {
      ...merged[existingIndex],
      ...row,
    };
  }
  return merged;
}

function mergePromptToolRunContextPatch(
  runContext: GenerationRunContext | undefined,
  patch: PromptToolRunContextPatch | null,
): GenerationRunContext | undefined {
  if (!patch) return runContext;

  const nextRunContext: GenerationRunContext = runContext
    ? { ...runContext }
    : ({} as GenerationRunContext);

  if (patch.guidance_patch) {
    const existingGuidancePatch = isRecord(nextRunContext.guidance_patch)
      ? (nextRunContext.guidance_patch as Record<string, unknown>)
      : {};
    nextRunContext.guidance_patch = deepMergeRecords(existingGuidancePatch, patch.guidance_patch);
  }

  if (patch.composition_assets_patch && patch.composition_assets_patch.length > 0) {
    const existingCompositionAssetsPatch = normalizeRecordList(nextRunContext.composition_assets_patch) ?? [];
    nextRunContext.composition_assets_patch = mergeCompositionAssetsPatch(
      existingCompositionAssetsPatch,
      patch.composition_assets_patch,
    );
  }

  return nextRunContext;
}

function hasMaskState(input: any): boolean {
  if (!input || typeof input !== 'object') return false;
  const hasMaskLayers = Array.isArray(input.maskLayers) && input.maskLayers.length > 0;
  const hasMaskUrl = typeof input.maskUrl === 'string' && input.maskUrl.trim().length > 0;
  return hasMaskLayers || hasMaskUrl;
}

function resolveMaskLayerAssetUrl(layer: any): string | undefined {
  if (!layer || typeof layer !== 'object') return undefined;
  if (typeof layer.assetUrl === 'string' && layer.assetUrl.trim().length > 0) {
    return layer.assetUrl.trim();
  }
  if (typeof layer.maskUrl === 'string' && layer.maskUrl.trim().length > 0) {
    return layer.maskUrl.trim();
  }
  const candidateId =
    (typeof layer.savedAssetId === 'number' && Number.isFinite(layer.savedAssetId)
      ? Math.floor(layer.savedAssetId)
      : undefined)
    ?? (typeof layer.assetId === 'number' && Number.isFinite(layer.assetId)
      ? Math.floor(layer.assetId)
      : undefined)
    ?? (typeof layer.asset?.id === 'number' && Number.isFinite(layer.asset.id)
      ? Math.floor(layer.asset.id)
      : undefined);
  if (typeof candidateId === 'number' && candidateId > 0) {
    return `asset:${candidateId}`;
  }
  return undefined;
}

function resolveMaskUrlFromInput(input: any): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  if (typeof input.maskUrl === 'string' && input.maskUrl.trim().length > 0) {
    return input.maskUrl.trim();
  }
  const layers = Array.isArray(input.maskLayers) ? input.maskLayers : [];
  if (layers.length === 0) return undefined;
  const normalizedLayers = layers
    .map((layer) => ({ layer, assetUrl: resolveMaskLayerAssetUrl(layer) }))
    .filter(
      (entry): entry is { layer: any; assetUrl: string } =>
        typeof entry.assetUrl === 'string' && entry.assetUrl.length > 0,
    );
  if (normalizedLayers.length === 0) return undefined;
  const visibleLayers = normalizedLayers.filter((entry) => entry.layer?.visible !== false);
  const activeLayers = visibleLayers.length > 0 ? visibleLayers : normalizedLayers;
  return activeLayers[0]?.assetUrl;
}

function mergeMaskState(baseInput: any, maskInput: any): any {
  if (!baseInput || !maskInput) return baseInput;
  return {
    ...baseInput,
    ...(typeof maskInput.maskUrl === 'string' ? { maskUrl: maskInput.maskUrl } : {}),
    ...(Array.isArray(maskInput.maskLayers) && maskInput.maskLayers.length > 0
      ? { maskLayers: maskInput.maskLayers }
      : {}),
  };
}

function getStoreState(store: any): any | null {
  if (!store || typeof store !== 'function' || typeof store.getState !== 'function') {
    return null;
  }
  try {
    return store.getState();
  } catch {
    return null;
  }
}

function findMaskInputInOperationItems(
  items: any[],
  options: { inputId?: string; assetId?: number },
): any | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (options.inputId) {
    const exact = items.find((item) => item?.id === options.inputId && hasMaskState(item));
    if (exact) return exact;
  }
  if (typeof options.assetId === 'number') {
    const sameAsset = items.find((item) => item?.asset?.id === options.assetId && hasMaskState(item));
    if (sameAsset) return sameAsset;
  }
  return null;
}

function findMaskInputInPersistedStorage(
  activeOperationType: OperationType,
  options: { inputId?: string; assetId?: number },
): any | null {
  if (typeof localStorage === 'undefined') return null;

  const persistedPrefix = 'generation_inputs';
  const keys = Object.keys(localStorage).filter(
    (key) => key === persistedPrefix || key.startsWith(`${persistedPrefix}:`),
  );

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const state = parsed?.state ?? parsed;
      const operationItems = state?.inputsByOperation?.[activeOperationType]?.items ?? [];
      const matched = findMaskInputInOperationItems(operationItems, options);
      if (matched) return matched;
    } catch {
      // Ignore malformed persisted entries.
    }
  }

  return null;
}

function recoverMaskInput(
  activeOperationType: OperationType,
  options: { inputId?: string; assetId?: number },
  preferredStores: any[] = [],
): any | null {
  const candidateStores: any[] = [
    ...preferredStores,
    useGenerationInputStore,
    ...getRegisteredInputStores(),
  ];
  const seenStores = new Set<any>();

  for (const store of candidateStores) {
    if (!store || seenStores.has(store)) continue;
    seenStores.add(store);
    const state = getStoreState(store);
    if (!state) continue;

    const operationItems = state.inputsByOperation?.[activeOperationType]?.items ?? [];
    const fromItems = findMaskInputInOperationItems(operationItems, options);
    if (fromItems) return fromItems;

    const fromCurrent =
      typeof state.getCurrentInput === 'function'
        ? state.getCurrentInput(activeOperationType)
        : null;
    if (fromCurrent && hasMaskState(fromCurrent)) {
      const sameInput = options.inputId && fromCurrent.id === options.inputId;
      const sameAsset = options.assetId != null && fromCurrent?.asset?.id === options.assetId;
      if (sameInput || sameAsset) {
        return fromCurrent;
      }
    }
  }

  return findMaskInputInPersistedStorage(activeOperationType, options);
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
/**
 * Internal implementation — runs the full 1800-line hook body. Consumers
 * should NOT call this directly; use `useQuickGenerateController()` instead,
 * which reads from `GenerationControllerContext` when a provider is mounted
 * (so the hook body runs once per scope instead of once per consumer).
 */
function useQuickGenerateControllerImpl() {
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
  const promptToolRunContextPatch = useSessionStore(
    (s) => s.uiState?.[PROMPT_TOOL_RUN_CONTEXT_PATCH_KEY],
  );
  // Phase 2b of plan:op-runtime-span-popover. PromptComposer pushes the
  // live snapshot into session via setSpanProvenance after each Adjust-tab
  // accept; we read it here at submit time and ship it as request.spanProvenance
  // so the new PromptVersion row carries the provenance.
  const spanProvenance = useSessionStore((s) => s.spanProvenance);

  // Probe-mode state read directly from scope. When ON, every generation entry
  // point auto-applies ephemeral=true + the bound preset's params (if any) so
  // the toggle reaches calls that don't go through the panel buttons —
  // AssetPanel's play-Generate, the widget capability used by media-card
  // gestures and prompt authoring, etc. Explicit caller values still win:
  // pass `ephemeral: false` to opt out of probe even with the toggle on.
  // Held in a ref so useCallback-wrapped paths (generateEach,
  // generateSequentialBurst) don't capture stale state.
  const [probeMode] = usePersistedScopeState(`probeMode:${operationType}`, false);
  const [probeParamSource] = usePersistedScopeState<string>(
    `probeParamSource:${operationType}`,
    PROBE_AS_SET,
  );
  const probePresetParams = useGenerationPresetStore((s) =>
    isProbePresetSource(probeParamSource)
      ? s.presets.find((p) => p.id === probeParamSource)?.params
      : undefined,
  );
  const probeStateRef = useRef<{ probeMode: boolean; probeParamSource: string; probePresetParams: Record<string, any> | undefined }>({
    probeMode,
    probeParamSource,
    probePresetParams,
  });
  probeStateRef.current = { probeMode, probeParamSource, probePresetParams };

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
  const watchedErrorCode = watchedGeneration?.errorCode;

  // Track which generation we've already shown error for (prevents re-triggering)
  const errorShownForRef = useRef<number | null>(null);

  // ─── Closure-stability infrastructure ────────────────────────────────────
  // The generation helpers below (executeGeneration, buildRequest, submitOne,
  // maybeRollTemplate, submitEachViaBackendExecution, withServerTemplateRollRunContext)
  // historically captured `bindings`, `prompt`, `providerId`, `operationType`,
  // `pinnedTemplateId`, `templateRollMode`, and `promptToolRunContextPatch`
  // from the React render scope. That made every exported action — `generate`,
  // `executeGeneration`, `generateCurrentOnly`, `generateSequentialBurst`,
  // `generateEach` — a fresh ref each render. Consumers couldn't use them as
  // `useEffect` deps and `React.memo` was useless.
  //
  // We funnel all those captures through a single ref updated each render. The
  // helpers read from `latestStateRef.current` instead of from closure, so they
  // can be wrapped in `useCallback([], …)` and remain referentially stable
  // while still seeing the latest state at call-time.
  //
  // Things that stay direct (no ref needed):
  //   - useState setters (setError, setGenerating, setGenerationId, setQueueProgress)
  //   - zustand actions read via selectors (setProvider, addOrUpdateGeneration, …)
  //   - other refs (probeStateRef, errorShownForRef)
  //   - the scope-store hooks themselves (useSessionStore, useInputStore, …)
  //     — their identity is provided by GenerationScopeProvider's memo
  const latestStateRef = useRef({
    bindings,
    prompt,
    providerId,
    operationType,
    pinnedTemplateId,
    templateRollMode,
    promptToolRunContextPatch,
  });
  latestStateRef.current = {
    bindings,
    prompt,
    providerId,
    operationType,
    pinnedTemplateId,
    templateRollMode,
    promptToolRunContextPatch,
  };

  useEffect(() => {
    // Skip if no generation, not failed, or already shown
    if (!generationId || watchedStatus !== 'failed') return;
    if (errorShownForRef.current === generationId) return;

    // Show error in prompt box for prompt rejections and input validation errors
    // (not for other failures like quota, network errors, output rejections, etc.)
    // Primary: dispatch on structured errorCode. Fallback: string matching for legacy.
    const errorCode = watchedErrorCode;
    const lowerError = watchedErrorMessage?.toLowerCase() ?? '';

    const isPromptRejection = errorCode === 'content_prompt_rejected'
      || errorCode === 'content_text_rejected'
      || (
        lowerError.includes('content filtered (prompt)')
        || lowerError.includes('content filtered (text)')
        || lowerError.includes('prompt rejected')
        || lowerError.includes('text input was rejected')
        || lowerError.includes('sensitive')
        || lowerError.includes('500063')
        || (lowerError.includes('content') && lowerError.includes('text'))
      );

    const isPromptTooLong = errorCode === 'param_too_long'
      || (
        lowerError.includes('too-long parameters')
        || lowerError.includes('cannot exceed')
        || lowerError.includes('prompt is too long')
        || lowerError.includes('input is too long')
      );

    // Note: content_render_moderated is intentionally NOT surfaced here. It's
    // retryable (auto-retries a few times, capped per-prompt), so a transient
    // first-fail must not pop a prompt-box error. Its signal lives in the
    // prompt success-rate chip (rate / fail-streak) and the "Render-time
    // filtered" warning strip — same silent-retry treatment as content_filtered.
    if (!isPromptRejection && !isPromptTooLong) return;

    // Mark as shown before setting error
    errorShownForRef.current = generationId;

    if (isPromptTooLong) {
      setError('Prompt too long: Your prompt exceeds the provider\'s character limit. Please shorten it and try again.');
    } else {
      setError('Content filtered: Your prompt may contain sensitive content. Please revise and try again.');
    }
  }, [generationId, watchedStatus, watchedErrorMessage, watchedErrorCode]);

  // ─── Shared generation helpers ───

  /** Auto-apply probe state to a GenerateOverrides bag. Explicit caller values
   *  win — only fills in ephemeral/paramOverrides when caller didn't set them.
   *  Reads through the ref so useCallback closures stay in sync. */
  function applyProbeState<T extends { ephemeral?: boolean; paramOverrides?: Record<string, any> } | undefined>(
    overrides: T,
  ): T {
    const { probeMode: pm, probePresetParams: pp } = probeStateRef.current;
    if (!pm) return overrides;
    const next: any = { ...(overrides ?? {}) };
    if (next.ephemeral === undefined) next.ephemeral = true;
    if (next.paramOverrides === undefined && pp) {
      next.paramOverrides = { ...pp };
    }
    return next;
  }

  /** Auto-apply probe state to the alternate options shape used by
   *  generateEach / generateSequentialBurst (overrideDynamicParams instead of
   *  paramOverrides). */
  function applyProbeStateAlt<T extends { ephemeral?: boolean; overrideDynamicParams?: Record<string, any> } | undefined>(
    options: T,
  ): T {
    const { probeMode: pm, probePresetParams: pp } = probeStateRef.current;
    if (!pm) return options;
    const next: any = { ...(options ?? {}) };
    if (next.ephemeral === undefined) next.ephemeral = true;
    if (next.overrideDynamicParams === undefined && pp) {
      next.overrideDynamicParams = { ...pp };
    }
    return next;
  }

  /** Reset state for a new generation attempt */
  function resetForGeneration() {
    setError(null);
    setGenerating(true);
    setGenerationId(null);
    errorShownForRef.current = null;
  }

  /** Read operation from store at call-time so commands don't depend on stale closures. */
  function getActiveOperationType(): OperationType {
    const sessionState = (useSessionStore as any).getState?.();
    return (sessionState?.operationType as OperationType | undefined) ?? latestStateRef.current.operationType;
  }

  /** True when the carousel index has been navigated past the last real item
   *  (the virtual "+ empty" slot used to opt into text-to-* in carousel mode).
   *  `getCurrentInput()` clamps `currentIndex` to `[1, items.length]` so callers
   *  must read the raw index directly to detect the virtual slot. */
  function isOnVirtualEmptySlot(activeOperationType: OperationType = getActiveOperationType()): boolean {
    const operationData = (useInputStore as any).getState().inputsByOperation?.[activeOperationType];
    const items = operationData?.items ?? [];
    const rawIndex = operationData?.currentIndex ?? 1;
    return items.length > 0 && rawIndex > items.length;
  }

  /** Read current input state from store (avoids stale React hook values) */
  function getInputState(activeOperationType: OperationType = getActiveOperationType()) {
    const inputState = (useInputStore as any).getState();
    const allItems = inputState.inputsByOperation?.[activeOperationType]?.items ?? [];
    let currentInputs = allItems.filter((item: any) => !item.skipped);
    let currentInput = inputState.getCurrentInput
      ? inputState.getCurrentInput(activeOperationType)
      : null;

    // Scope divergence guard:
    // If this controller is bound to a different scoped input store than the
    // mask picker, recover mask state from any known generation input store
    // (and persisted snapshots) using input id/asset id.
    if (currentInput && !hasMaskState(currentInput)) {
      const maskLookup = {
        inputId: typeof currentInput.id === 'string' ? currentInput.id : undefined,
        assetId: typeof currentInput?.asset?.id === 'number' ? currentInput.asset.id : undefined,
      };
      const recoveredMaskInput = recoverMaskInput(activeOperationType, maskLookup, [useInputStore]);

      if (recoveredMaskInput) {
        currentInput = mergeMaskState(currentInput, recoveredMaskInput);
        currentInputs = currentInputs.map((item: any) =>
          item?.id === currentInput?.id ? mergeMaskState(item, recoveredMaskInput) : item,
        );
      }
    }

    const allTransitionItems = inputState.inputsByOperation?.video_transition?.items ?? [];
    const transitionInputs = allTransitionItems.filter((item: any) => !item.skipped);
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
    const { pinnedTemplateId: activeTemplateId } = latestStateRef.current;
    if (!activeTemplateId) return null;
    const { draftCharacterBindings: bindings, controlValues } = useBlockTemplateStore.getState();
    const hasBindings = Object.keys(bindings).length > 0;
    const hasControlOverrides = Object.keys(controlValues).length > 0;
    const result = await rollTemplate(activeTemplateId, {
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
    activeOperationType: OperationType,
    dynamicParams: Record<string, any>,
    operationInputs: any[],
    currentInput: any,
    overrides?: { activeAsset?: ReturnType<typeof toSelectedAsset> | null; promptOverride?: string | null },
  ): Promise<{ error: string } | {
    finalPrompt: string;
    params: any;
    effectiveOperationType: OperationType;
    pickStateUpdates?: PickStateUpdate[];
    inputProvenance?: InputProvenanceEntry[];
    inputAssetIds: number[];
    historyAssets: HistoryAsset[];
  }> {
    const {
      providerId: activeProviderId,
      prompt: activePrompt,
      bindings: activeBindings,
    } = latestStateRef.current;
    // Resolve prompt limit so buildGenerationRequest can clamp the prompt
    const opSpec = providerCapabilityRegistry.getOperationSpec(activeProviderId ?? '', activeOperationType);
    const model = dynamicParams?.model as string | undefined;
    const maxChars = resolvePromptLimitForModel(activeProviderId, model, opSpec?.parameters);

    // Clamp inputs to max slots. Callers should already clamp (so tracking agrees),
    // but we defensively clamp here too since buildRequest has multiple call sites.
    const clampedInputs = clampInputsToMaxSlots(operationInputs, activeOperationType, model, activeProviderId);

    // activeAsset: null means explicitly skip gallery fallback (e.g. empty carousel slot).
    // undefined means "not provided" → use gallery fallback.
    const resolvedActiveAsset = overrides && 'activeAsset' in overrides
      ? overrides.activeAsset ?? undefined
      : activeBindings.lastSelectedAsset;

    const buildResult = await buildGenerationRequest({
      operationType: activeOperationType,
      prompt: overrides?.promptOverride ?? activePrompt,
      dynamicParams,
      operationInputs: clampedInputs,
      prompts: activeBindings.prompts,
      transitionDurations: activeBindings.transitionDurations,
      activeAsset: resolvedActiveAsset,
      currentInput,
      maxChars,
    });

    if (buildResult.error || !buildResult.params) {
      return { error: buildResult.error ?? 'Invalid generation request' };
    }

    const fallbackMaskUrlFromCurrentInput = resolveMaskUrlFromInput(currentInput);
    const fallbackMaskUrlFromInputs = Array.isArray(clampedInputs)
      ? clampedInputs
          .map((input: any) => resolveMaskUrlFromInput(input))
          .find((value): value is string => typeof value === 'string' && value.length > 0)
      : undefined;
    const fallbackMaskUrl = fallbackMaskUrlFromCurrentInput ?? fallbackMaskUrlFromInputs;
    if (!buildResult.params.mask_url && fallbackMaskUrl) {
      buildResult.params.mask_url = fallbackMaskUrl;
    }

    if (import.meta.env.DEV) {
      const inputMaskLayers = Array.isArray(currentInput?.maskLayers)
        ? currentInput.maskLayers.map((layer: any) => ({
            id: layer?.id ?? null,
            assetUrl: layer?.assetUrl ?? null,
            visible: layer?.visible,
          }))
        : [];
      console.debug('[quickgen:mask-debug]', {
        operationType: activeOperationType,
        currentInputId: currentInput?.id ?? null,
        currentInputAssetId: currentInput?.asset?.id ?? null,
        inputMaskLayers,
        inputMaskUrl: currentInput?.maskUrl ?? null,
        fallbackMaskUrlFromCurrentInput: fallbackMaskUrlFromCurrentInput ?? null,
        fallbackMaskUrlFromInputs: fallbackMaskUrlFromInputs ?? null,
        resolvedMaskUrl: buildResult.params?.mask_url ?? null,
      });
      (globalThis as any).__quickgenLastMaskDebug = {
        ts: Date.now(),
        operationType: activeOperationType,
        currentInputId: currentInput?.id ?? null,
        currentInputAssetId: currentInput?.asset?.id ?? null,
        fallbackMaskUrlFromCurrentInput: fallbackMaskUrlFromCurrentInput ?? null,
        fallbackMaskUrlFromInputs: fallbackMaskUrlFromInputs ?? null,
        resolvedMaskUrl: buildResult.params?.mask_url ?? null,
        hasCompositionAssets:
          Array.isArray(buildResult.params?.composition_assets)
          && buildResult.params.composition_assets.length > 0,
      };
    }

    const hasAssetInput =
      Array.isArray(buildResult.params.composition_assets) && buildResult.params.composition_assets.length > 0;

    const effectiveOperationType = getFallbackOperation(activeOperationType, hasAssetInput);

    // Don't switch the UI operation — the user chose i2v/i2i intentionally.
    // The effective type is only used for the API call; the UI stays on the
    // user's chosen operation so the prompt and param scoping aren't disrupted.

    // Stamp tracking derived from the clamped inputs so downstream consumers
    // (history, run-context inputAssetIds) can't drift from what was sent.
    const inputAssetIds = clampedInputs
      .map((item: any) => item?.asset?.id)
      .filter((id: unknown): id is number => typeof id === 'number' && Number.isFinite(id));
    const historyAssets = buildHistoryAssets(clampedInputs);

    return {
      finalPrompt: buildResult.finalPrompt,
      params: buildResult.params,
      effectiveOperationType,
      pickStateUpdates: buildResult.pickStateUpdates,
      inputProvenance: buildResult.inputProvenance,
      inputAssetIds,
      historyAssets,
    };
  }

  /** Persist pick state updates (sequential index / no_repeat history) and update display assets */
  function applyPickStateUpdates(
    updates: PickStateUpdate[] | undefined,
    activeOperationType: OperationType = getActiveOperationType(),
  ) {
    if (!updates || updates.length === 0) return;
    const inputStore = (useInputStore as any).getState();
    for (const update of updates) {
      // Persist strategy state
      inputStore.updatePickState(activeOperationType, update.inputId, {
        pickIndex: update.pickIndex,
        recentPicks: update.recentPicks,
      });

      // Update display asset to show the picked asset
      const state = (useInputStore as any).getState();
      const existing = state.inputsByOperation?.[activeOperationType];
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
              [activeOperationType]: {
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
  async function preResolveSetRefs(inputs: any[]): Promise<Map<number, AssetModel[]>> {
    const cache = new Map<number, AssetModel[]>();
    const setIds = new Set<number>();
    for (const item of inputs) {
      const ref = item?.assetSetRef;
      if (ref?.setId && !setIds.has(ref.setId)) {
        setIds.add(ref.setId);
      }
    }
    if (setIds.size > 0) {
      // Backend-backed cache; ensure it's loaded before the sync getSet() reads.
      await useAssetSetStore.getState().ensureLoaded();
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

  interface TransientSetPickState {
    pickIndex?: number;
    recentPicks?: number[];
  }

  /**
   * Replace assetSetRef on inputs with a concrete pre-picked asset using
   * the cached resolved sets. Returns new input array (does not mutate).
   */
  function prePickSetRefs(
    inputs: any[],
    cache: Map<number, AssetModel[]>,
    transientPickStateByInputId?: Map<string, TransientSetPickState>,
  ): any[] {
    if (cache.size === 0) return inputs;
    return inputs.map((item: any) => {
      const ref = item?.assetSetRef;
      if (!ref || ref.mode !== 'random_each') return item;
      const setAssets = cache.get(ref.setId);
      if (!setAssets || setAssets.length === 0) return item;
      const priorState = transientPickStateByInputId?.get(item.id);
      const effectiveRef = priorState ? { ...ref, ...priorState } : ref;
      const { asset, updatedRef } = pickFromSet(setAssets, ref.pickStrategy, effectiveRef);
      if (transientPickStateByInputId && (updatedRef.pickIndex !== undefined || updatedRef.recentPicks !== undefined)) {
        transientPickStateByInputId.set(item.id, {
          ...(updatedRef.pickIndex !== undefined ? { pickIndex: updatedRef.pickIndex } : {}),
          ...(updatedRef.recentPicks !== undefined ? { recentPicks: updatedRef.recentPicks } : {}),
        });
      }
      return {
        ...item,
        asset,
        assetSetRef: undefined,
        // Carry set lineage so buildGenerationRequest can stamp run_context
        // provenance even though the live ref is consumed here.
        assetSetProvenance: { setId: ref.setId, mode: ref.mode, pickStrategy: ref.pickStrategy },
      };
    });
  }

  // Resolves iterate-mode slots into concrete assets per iteration, and applies
  // the selected strategy on top.
  //
  // Iteration dimension:
  //  - default: zip with max-wrap across iterate slots
  //  - all_pairs + ≥2 iterate slots: cartesian product across iterate slots
  //
  // Per-iteration cross-slot dimension (applied to resolved slots):
  //  - each: keep all slots in a single group (iterate-natural meaning)
  //  - cartesian path: also keep all slots in a single group (cartesian already provides fanout)
  //  - anchor_sweep / sequential_pairs / all_pairs (non-cartesian): apply normally
  //
  // Other slots (concrete, locked, random_each) pass through unchanged —
  // random_each gets resolved per-group later by prePickSetRefs.
  function buildIterateGroups(
    inputs: any[],
    cache: Map<number, AssetModel[]>,
    strategy: CombinationStrategy,
    seed?: number,
  ): any[][] {
    const iterateRefs = inputs.flatMap((item: any) => {
      const ref = item?.assetSetRef;
      return ref?.mode === 'iterate' && ref.setId ? [{ item, ref }] : [];
    });
    if (iterateRefs.length === 0) return [];

    const rng = randomForFanoutSeed(seed);
    const useCartesian = strategy === 'all_pairs' && iterateRefs.length >= 2;

    // Per-slot index ordering (random or sequential)
    const ordersByInputId = new Map<string, number[]>();
    for (const { item, ref } of iterateRefs) {
      const size = cache.get(ref.setId)?.length ?? 0;
      if (size === 0) continue;
      const order = Array.from({ length: size }, (_, k) => k);
      if ((ref.pickStrategy ?? 'sequential') === 'random') {
        for (let i = size - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      }
      ordersByInputId.set(item.id, order);
    }

    // Build iteration plans: list of `inputId → setIndex` maps, one per iteration.
    const plans: Array<Map<string, number>> = [];

    if (useCartesian) {
      const dims = iterateRefs.map(({ item }) => ({
        inputId: item.id,
        order: ordersByInputId.get(item.id) ?? [],
      }));
      const sizes = dims.map((d) => Math.max(1, d.order.length));
      const total = sizes.reduce((a, b) => a * b, 1);
      for (let n = 0; n < total; n++) {
        const plan = new Map<string, number>();
        let rem = n;
        for (let d = dims.length - 1; d >= 0; d--) {
          const size = sizes[d];
          const local = size > 0 ? rem % size : 0;
          rem = size > 0 ? Math.floor(rem / size) : rem;
          plan.set(dims[d].inputId, dims[d].order[local] ?? 0);
        }
        plans.push(plan);
      }
    } else {
      const baseRuns = Math.max(0, ...iterateRefs.map(({ ref }) => cache.get(ref.setId)?.length ?? 0));
      for (let i = 0; i < baseRuns; i++) {
        const plan = new Map<string, number>();
        for (const { item } of iterateRefs) {
          const order = ordersByInputId.get(item.id);
          const size = order?.length ?? 0;
          if (size === 0) continue;
          plan.set(item.id, order![i % size]);
        }
        plans.push(plan);
      }
    }

    // Apply per-iteration strategy
    const out: any[][] = [];
    for (const plan of plans) {
      const resolvedSlots = inputs.map((item: any) => {
        const ref = item?.assetSetRef;
        if (ref?.mode !== 'iterate' || !ref.setId || !plan.has(item.id)) return item;
        const setAssets = cache.get(ref.setId);
        const setIndex = plan.get(item.id)!;
        if (!setAssets || setAssets.length === 0) return item;
        return {
          ...item,
          asset: setAssets[setIndex],
          assetSetRef: undefined,
          assetSetProvenance: { setId: ref.setId, mode: ref.mode, pickStrategy: ref.pickStrategy },
        };
      });

      if (strategy === 'each' || useCartesian) {
        out.push(resolvedSlots);
      } else {
        const subGroups = computeCombinations(resolvedSlots, strategy as EachStrategy);
        for (const g of subGroups) out.push(g);
      }
    }

    return out;
  }

  function withServerTemplateRollRunContext(
    runContext?: GenerationRunContext,
  ): GenerationRunContext | undefined {
    const {
      promptToolRunContextPatch: activePatch,
      pinnedTemplateId: activeTemplateId,
      templateRollMode: activeRollMode,
    } = latestStateRef.current;
    const promptToolPatch = normalizePromptToolRunContextPatch(activePatch);
    const mergedRunContext = mergePromptToolRunContextPatch(runContext, promptToolPatch);
    if (!mergedRunContext || !activeTemplateId || activeRollMode !== 'each') {
      return mergedRunContext;
    }
    const draftBindings = useBlockTemplateStore.getState().draftCharacterBindings;
    const hasBindings = Object.keys(draftBindings).length > 0;
    return {
      ...mergedRunContext,
      block_template_id: activeTemplateId,
      ...(hasBindings ? { character_bindings: draftBindings } : {}),
    };
  }

  /** Submit a single generation to the API and seed the generations store */
  async function submitOne(
    request: { finalPrompt: string; params: any; effectiveOperationType: OperationType },
    runContext?: GenerationRunContext,
  ) {
    const { providerId: activeProviderId } = latestStateRef.current;
    const result = await generateAsset({
      prompt: request.finalPrompt,
      providerId: activeProviderId,
      operationType: request.effectiveOperationType,
      extraParams: request.params,
      runContext: withServerTemplateRollRunContext(runContext),
      spanProvenance: spanProvenance.length > 0 ? spanProvenance : undefined,
    });

    const genId = result.job_id;
    addOrUpdateGeneration(createPendingGeneration({
      id: genId,
      operationType: request.effectiveOperationType,
      providerId: activeProviderId,
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
    /** Probe-mode cheap defaults (e.g. { duration: 5 }); lower precedence than per-input bindings. */
    probeParams?: Record<string, any>;
    /** Explicit caller param overrides; highest precedence. */
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
      probeParams,
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
    const transientPickStateByInputId = new Map<string, TransientSetPickState>();

    const itemPayloads = await prepareEachExecutionItems({
      groups,
      total,
      strategy,
      onError,
      emptyErrorMessage: `No valid items could be prepared for backend ${executionMode === 'sequential' ? 'sequential Each' : 'fanout'}`,
      prepareItem: async ({ index: i, total, group, primaryInput }) => {
        const {
          bindings: activeBindings,
          providerId: activeProviderId,
          operationType: activeOperationType,
        } = latestStateRef.current;
        const resolvedGroup = prePickSetRefs(group, setCache, transientPickStateByInputId);
        const resolvedPrimary = resolvedGroup[0] ?? primaryInput;
        // Precedence (low→high): shared defaults < probe cheap defaults <
        // per-input bindings < explicit caller overrides. A per-input duration
        // binding therefore beats probe's duration:5 but still yields to an
        // explicit caller override. Plan: per-input-param-override.
        const dynamicParams = buildDynamicParams(
          activeBindings.dynamicParams,
          probeParams,
          resolvedPrimary?.paramOverrides,
          overrideParams,
        );
        await applyFrameExtraction(dynamicParams, resolvedPrimary, []);
        // Per-input pinned prompt wins verbatim over the (shared) rolled prompt
        // so each queued asset can carry its own prompt while un-pinned inputs
        // fall back to the operation default. Plan: per-asset-prompt-pin.
        const pinnedGroupPrompt = getPinnedPrompt(resolvedPrimary);
        const request = await buildRequest(
          activeOperationType,
          dynamicParams,
          resolvedGroup,
          resolvedPrimary,
          { promptOverride: pinnedGroupPrompt ?? rolledOnce },
        );
        if ('error' in request) {
          return { kind: 'skip', reason: request.error };
        }
        const runContext = createGenerationRunItemContext(run, {
          itemIndex: i,
          itemTotal: total,
          inputAssetIds: request.inputAssetIds,
          inputProvenance: request.inputProvenance,
        });
        const prepared = prepareGenerateAssetSubmission({
          prompt: request.finalPrompt,
          providerId: activeProviderId,
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

    const {
      providerId: dispatchProviderId,
    } = latestStateRef.current;
    const request = prepareEachBackendExecutionPayload({
      providerId: dispatchProviderId || 'pixverse',
      strategy,
      onError,
      executionMode,
      reusePreviousOutputAsInput,
      items: itemPayloads,
    });

    const { executionId } = await dispatchRawItemBackendExecution(request);

    // Fire-and-forget progress tracker. Seeds a pending card the moment each
    // backend item registers a generation_id (visible while the run is still
    // in flight). The QuickGen UI is released as soon as dispatch returns.
    trackRawItemBackendExecution({
      executionId,
      total,
      executionMode,
      onProgress: (progress) => setQueueProgress(progress),
      onNewGenerationId: (genId) => {
        const {
          operationType: trackerOperationType,
          providerId: trackerProviderId,
          prompt: trackerPrompt,
        } = latestStateRef.current;
        addOrUpdateGeneration(createPendingGeneration({
          id: genId,
          operationType: trackerOperationType,
          providerId: trackerProviderId,
          finalPrompt: trackerPrompt,
          params: {},
          status: 'pending',
        }));
        setGenerationId(genId);
        setWatchingGeneration(genId);
      },
    })
      .catch((err) => {
        console.error('[quickgen] backend each tracker failed', err);
      })
      .finally(() => {
        setTimeout(() => setQueueProgress(null), 2000);
      });
  }

  /** Mark the most recently generated id as active + watched (no-op if empty). */
  function setLastGenerationIdAsActive(generatedIds: number[]) {
    if (generatedIds.length === 0) return;
    const lastId = generatedIds[generatedIds.length - 1];
    setGenerationId(lastId);
    setWatchingGeneration(lastId);
  }

  /**
   * Generation pipeline core — builds request, submits to API, seeds generations store.
   * Does NOT touch active widget run state (generating, error, queueProgress).
   * It does update `generationId` so downstream rejection watchers can surface
   * provider-side prompt/content failures for non-UI triggers (e.g. gestures).
   * Throws on fatal errors (build failure, template roll failure).
   *
   * Use this from external triggers (media cards, gestures) to avoid
   * side-effects on the widget's UI state.
   */
  async function executeGeneration(
    rawOverrides?: GenerateOverrides,
    callbacks?: { onProgress?: (progress: { queued: number; total: number } | null) => void },
  ): Promise<GenerationPipelineResult> {
    const {
      bindings: activeBindings,
      providerId: activeProviderId,
      pinnedTemplateId: activeTemplateId,
      templateRollMode: activeRollMode,
    } = latestStateRef.current;
    let overrides = applyProbeState(rawOverrides);
    const activeOperationType = getActiveOperationType();
    // Carousel virtual empty slot: the user navigated past real items to opt
    // into text-to-* . Callers that pass no asset hint (main "Go" button,
    // generation-preset triggers, external gestures) would otherwise pull every
    // queued carousel input from the store — both into composition_assets and
    // into run_context.input_asset_ids — stamping unintended lineage onto the
    // generated asset. Synthesize the same empty-input signal the AssetPanel's
    // own generate button already sends.
    if (
      !Array.isArray(overrides?.assetOverrides)
      && !overrides?.skipActiveAssetFallback
      && isOnVirtualEmptySlot(activeOperationType)
    ) {
      overrides = { ...(overrides ?? {}), assetOverrides: [], skipActiveAssetFallback: true } as typeof overrides;
    }
    const burstCount = overrides?.count && overrides.count > 1 ? overrides.count : 1;
    const isBurst = burstCount > 1;
    const hasAssetOverrides = Array.isArray(overrides?.assetOverrides);

    const { currentInputs, currentInput, transitionInputs } = getInputState(activeOperationType);
    const probeDefaults = overrides?.ephemeral
      ? resolveProbeCheapDefaults(activeOperationType, probeStateRef.current.probeParamSource)
      : null;
    // Precedence (low→high): shared < probe < per-input binding < caller override.
    // Per-input params ride the current input alongside its promptOverride (resolved
    // below). Plan: per-input-param-override.
    const dynamicParams = buildDynamicParams(
      activeBindings.dynamicParams,
      probeDefaults,
      currentInput?.paramOverrides,
      overrides?.paramOverrides,
    );

    // assetOverrides are documented as replacing current inputs, so clear any
    // persisted source/composition params that could override the provided assets.
    // Keep the same clearing behavior for explicit skipActiveAssetFallback too.
    if (overrides?.skipActiveAssetFallback || hasAssetOverrides) {
      clearSourceAssetParams(dynamicParams);
    }

    // Asset overrides: convert AssetModel[] to InputItems, bypassing store inputs
    let effectiveInputs: any[];
    let effectiveCurrentInput: any;
    let activeAssetOverride: ReturnType<typeof toSelectedAsset> | undefined;

    if (Array.isArray(overrides?.assetOverrides)) {
      const maskCandidates = [
        currentInput,
        ...currentInputs,
      ].filter((item) => hasMaskState(item));

      const inputItems = overrides.assetOverrides.map((asset, index) => {
        const baseInput = {
          id: `quick-${asset.id}-${Date.now()}-${index}`,
          asset,
          queuedAt: new Date().toISOString(),
          lockedTimestamp: undefined,
        };

        const fromKnownInputs = maskCandidates.find(
          (item: any) => item?.asset?.id === asset.id && hasMaskState(item),
        );
        const recoveredMaskInput =
          fromKnownInputs
          ?? recoverMaskInput(activeOperationType, { assetId: asset.id }, [useInputStore]);

        return recoveredMaskInput
          ? mergeMaskState(baseInput, recoveredMaskInput)
          : baseInput;
      });
      effectiveInputs = inputItems;
      effectiveCurrentInput = inputItems[0] ?? null;
      if (overrides.assetOverrides.length > 0) {
        activeAssetOverride = toSelectedAsset(overrides.assetOverrides[0], 'gallery');
      }
    } else {
      effectiveInputs = currentInputs;
      effectiveCurrentInput = currentInput;

      // When the provider only accepts a single input for this op/model,
      // Go should use the actively-selected carousel input rather than
      // silently taking the first item in the queue. Matches the "current
      // only" split-button behavior so tracking/history stay in sync with
      // what the user sees selected.
      const model = dynamicParams?.model as string | undefined;
      const opSpec = providerCapabilityRegistry.getOperationSpec(activeProviderId ?? '', activeOperationType);
      const resolvedMax = resolveMaxSlotsFromSpecs(opSpec?.parameters, activeOperationType, model)
        ?? resolveMaxSlotsForModel(activeOperationType, model);
      if (resolvedMax === 1 && effectiveCurrentInput?.asset && effectiveInputs.length > 1) {
        effectiveInputs = [effectiveCurrentInput];
        clearSourceAssetParams(dynamicParams);
      }
    }

    // Auto-upload any local-only assets (blob: URLs can't reach the backend)
    effectiveInputs = await ensureInputsUploaded(effectiveInputs);
    // Refresh currentInput ref in case it was patched with a real asset ID
    if (effectiveCurrentInput) {
      const patched = effectiveInputs.find((i: any) => i.id === effectiveCurrentInput.id);
      if (patched) effectiveCurrentInput = patched;
    }

    await applyFrameExtraction(dynamicParams, effectiveCurrentInput, transitionInputs);

    // Template handling:
    // - Caller-provided promptOverride skips template rolling entirely
    // - A per-input pinned prompt (promptOverride on the current input) also
    //   wins verbatim and skips the roll. Precedence: explicit caller override >
    //   per-input pin > template roll > live operation prompt. Plan: per-asset-prompt-pin.
    // - 'each' mode: backend rolls per request using run_context
    // - 'once' mode: roll once client-side and pass prompt override
    const pinnedCurrentPrompt = getPinnedPrompt(effectiveCurrentInput);
    const explicitOrPinnedPrompt = overrides?.promptOverride ?? pinnedCurrentPrompt;
    const useServerRolling = activeTemplateId && activeRollMode === 'each';
    const rolledOnce = explicitOrPinnedPrompt
      ? null  // skip template roll when an explicit or per-input pinned prompt applies
      : (!useServerRolling ? await maybeRollTemplate() : null);
    const requestOverrides: { activeAsset?: ReturnType<typeof toSelectedAsset> | null; promptOverride?: string | null } = {
      promptOverride: explicitOrPinnedPrompt ?? rolledOnce,
    };
    if (activeAssetOverride) {
      requestOverrides.activeAsset = activeAssetOverride;
    } else if (overrides?.skipActiveAssetFallback || hasAssetOverrides) {
      requestOverrides.activeAsset = null;
    }

    if (isBurst) {
      // ── Burst path ──
      const generatedIds: number[] = [];
      const burstRunMetadata: Record<string, unknown> = {};
      if (overrides?.assetOverrides) burstRunMetadata.source = 'assetOverrides';
      if (overrides?.ephemeral) burstRunMetadata.ephemeral = true;
      const run = createGenerationRunDescriptor({
        mode: 'quickgen_burst',
        ...(Object.keys(burstRunMetadata).length > 0 ? { metadata: burstRunMetadata } : {}),
      });
      callbacks?.onProgress?.({ queued: 0, total: burstCount });

      // Pre-resolve sets once so burst iterations don't re-resolve per item
      const hasRandomEachRef = effectiveInputs.some(
        (item: any) => item.assetSetRef?.mode === 'random_each',
      );
      const setCache = hasRandomEachRef ? await preResolveSetRefs(effectiveInputs) : new Map<number, AssetModel[]>();
      const burstPickStateByInputId = new Map<string, TransientSetPickState>();

      // Build a base request for validation (and reuse when no random_each refs)
      const baseRequest = await buildRequest(
        activeOperationType,
        dynamicParams,
        effectiveInputs,
        effectiveCurrentInput,
        requestOverrides,
      );
      if ('error' in baseRequest) {
        throw new Error(baseRequest.error);
      }

      if (!overrides?.ephemeral) {
        recordInputHistory(activeOperationType, baseRequest.historyAssets);
      }

      // Pre-build all requests (sequential only when random_each needs fresh picks)
      const burstRequests: typeof baseRequest[] = [];
      for (let i = 0; i < burstCount; i++) {
        let request = baseRequest;
        if (hasRandomEachRef) {
          const pickedInputs = prePickSetRefs(effectiveInputs, setCache, burstPickStateByInputId);
          const pickedCurrent = pickedInputs.find((item: any) => item.id === effectiveCurrentInput?.id) ?? effectiveCurrentInput;
          const freshRequest = await buildRequest(
            activeOperationType,
            dynamicParams,
            pickedInputs,
            pickedCurrent,
            requestOverrides,
          );
          if (!('error' in freshRequest)) {
            request = freshRequest;
          }
        }
        burstRequests.push(request);
      }

      // Fire all submissions concurrently
      const results = await Promise.allSettled(
        burstRequests.map((request, i) =>
          submitOne(
            request,
            createGenerationRunItemContext(run, {
              itemIndex: i,
              itemTotal: burstCount,
              inputAssetIds: request.inputAssetIds,
              inputProvenance: request.inputProvenance,
            }),
          ),
        ),
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          generatedIds.push(result.value);
          callbacks?.onProgress?.({ queued: generatedIds.length, total: burstCount });
          logEvent('INFO', 'burst_generation_created', {
            generationId: result.value,
            operationType: activeOperationType,
            providerId: activeProviderId || 'pixverse',
            burstIndex: i + 1,
            burstTotal: burstCount,
          });
        } else {
          logEvent('ERROR', 'burst_item_failed', {
            burstIndex: i + 1,
            error: extractErrorMessage(result.reason, 'Unknown error'),
          });
        }
      }

      setLastGenerationIdAsActive(generatedIds);

      logEvent('INFO', 'burst_complete', {
        queued: generatedIds.length,
        total: burstCount,
        operationType: activeOperationType,
        providerId: activeProviderId || 'pixverse',
      });

      return { generationIds: generatedIds, pickStateUpdates: baseRequest.pickStateUpdates };
    }

    // ── Single generation path ──
    const request = await buildRequest(
      activeOperationType,
      dynamicParams,
      effectiveInputs,
      effectiveCurrentInput,
      requestOverrides,
    );
    if ('error' in request) {
      throw new Error(request.error);
    }

    const singleRunMetadata: Record<string, unknown> = {};
    if (overrides?.assetOverrides) singleRunMetadata.source = 'assetOverrides';
    if (overrides?.ephemeral) singleRunMetadata.ephemeral = true;
    const run = createGenerationRunDescriptor({
      mode: 'quickgen_single',
      ...(Object.keys(singleRunMetadata).length > 0 ? { metadata: singleRunMetadata } : {}),
    });
    const genId = await submitOne(
      request,
      createGenerationRunItemContext(run, {
        itemIndex: 0,
        itemTotal: 1,
        inputAssetIds: request.inputAssetIds,
        inputProvenance: request.inputProvenance,
      }),
    );
    setLastGenerationIdAsActive([genId]);
    if (!overrides?.ephemeral) {
      recordInputHistory(activeOperationType, request.historyAssets);
    }

    logEvent('INFO', 'generation_created', {
      generationId: genId,
      operationType: activeOperationType,
      providerId: activeProviderId || 'pixverse',
      status: 'pending',
    });

    return { generationIds: [genId], pickStateUpdates: request.pickStateUpdates };
  }

  /**
   * Widget-facing generation entry point.
   * Wraps executeGeneration with widget state management (generating, error,
   * generationId, queueProgress). Use this when the generation is triggered
   * from the widget's own UI (Go button).
   */
  async function generate(overrides?: GenerateOverrides) {
    resetForGeneration();
    const isBurst = overrides?.count && overrides.count > 1;

    try {
      const result = await executeGeneration(overrides, {
        onProgress: setQueueProgress,
      });

      if (result.generationIds.length > 0) {
        setGenerationId(result.generationIds[result.generationIds.length - 1]);
      }
      applyPickStateUpdates(result.pickStateUpdates);
    } catch (err) {
      console.error('[generate]', err);
      setError(extractErrorMessage(err, 'Failed to generate asset'));
    } finally {
      setGenerating(false);
      if (isBurst) {
        setTimeout(() => setQueueProgress(null), 2000);
      }
    }
  }

  const generateSequentialBurst = useCallback(async (
    count: number,
    rawOptions?: { overrideDynamicParams?: Record<string, any>; ephemeral?: boolean },
  ) => {
    const {
      bindings: activeBindings,
      providerId: activeProviderId,
      pinnedTemplateId: activeTemplateId,
      templateRollMode: activeRollMode,
    } = latestStateRef.current;
    const options = applyProbeStateAlt(rawOptions);
    if (count <= 1) return generate({ paramOverrides: options?.overrideDynamicParams, ephemeral: options?.ephemeral });

    resetForGeneration();
    const total = count;
    const activeOperationType = getActiveOperationType();
    const generatedIds: number[] = [];
    const seqBurstMetadata: Record<string, unknown> = {};
    if (options?.ephemeral) seqBurstMetadata.ephemeral = true;
    const run = createGenerationRunDescriptor({
      mode: 'quickgen_burst',
      ...(Object.keys(seqBurstMetadata).length > 0 ? { metadata: seqBurstMetadata } : {}),
    });
    setQueueProgress({ queued: 0, total });

    try {
      const { currentInputs: rawCurrentInputs, currentInput, transitionInputs } = getInputState(activeOperationType);
      const probeDefaults = options?.ephemeral
        ? resolveProbeCheapDefaults(activeOperationType, probeStateRef.current.probeParamSource)
        : null;
      // Per-input bindings on the source input carry through the whole chained
      // sequence (like the pinned prompt below). Precedence: shared < probe <
      // per-input < caller override. Plan: per-input-param-override.
      const baseDynamicParams = buildDynamicParams(
        activeBindings.dynamicParams,
        probeDefaults,
        currentInput?.paramOverrides,
        options?.overrideDynamicParams,
      );

      await applyFrameExtraction(baseDynamicParams, currentInput, transitionInputs);

      // A pin on the source input carries through the whole chained sequence
      // (steps 2+ reuse the previous output but keep the source's prompt).
      // Plan: per-asset-prompt-pin.
      const pinnedSeqPrompt = getPinnedPrompt(currentInput);
      const useServerRolling = activeTemplateId && activeRollMode === 'each';
      const rollOnce = pinnedSeqPrompt
        ? null
        : (!useServerRolling ? await maybeRollTemplate() : null);

      // No per-step buildRequest to derive from (steps 2+ use previous output),
      // so clamp+record manually here. This is the one entry point that can't
      // rely on request.historyAssets.
      const currentInputs = clampInputsToMaxSlots(
        rawCurrentInputs,
        activeOperationType,
        baseDynamicParams?.model as string | undefined,
        activeProviderId,
      );
      if (!options?.ephemeral) {
        recordInputHistory(activeOperationType, buildHistoryAssets(currentInputs));
      }

      // Pre-resolve sets once for step 1 (step 2+ uses previous output, no set refs)
      const hasRandomEachRef = currentInputs.some(
        (item: any) => item.assetSetRef?.mode === 'random_each',
      );
      const setCache = hasRandomEachRef ? await preResolveSetRefs(currentInputs) : new Map<number, AssetModel[]>();
      const sequentialBurstPickStateByInputId = new Map<string, TransientSetPickState>();

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
            operationInputsForStep = prePickSetRefs(currentInputs, setCache, sequentialBurstPickStateByInputId);
            currentInputForStep = operationInputsForStep.find((item: any) => item.id === currentInput?.id) ?? currentInput;
          }

          const request = await buildRequest(
            activeOperationType,
            dynamicParams,
            operationInputsForStep,
            currentInputForStep,
            { promptOverride: pinnedSeqPrompt ?? rollOnce },
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

      setLastGenerationIdAsActive(generatedIds);

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
    // Empty deps: this callback's body reads all changing state via
    // `latestStateRef.current`, and only references functions/setters that are
    // either intrinsically stable (useState setters, store actions, refs) or
    // first-render closures of helpers that themselves read via the ref. See
    // the `Closure-stability infrastructure` block near the top of this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Generate individually for each queued input asset (or group of assets
   * when a combination strategy is selected). Same prompt and settings, but
   * one generation per group.
   *
   * Asset-set iteration is driven by per-slot `assetSetRef.mode === 'iterate'`
   * — the strategy here only describes how multiple input slots zip together.
   */
  const generateEach = useCallback(async (rawOptions?: {
    overrideDynamicParams?: Record<string, any>;
    strategy?: CombinationStrategy;
    fanoutOptions?: Partial<FanoutRunOptions>;
    ephemeral?: boolean;
  }) => {
    const {
      operationType: activeOperationType,
      pinnedTemplateId: activeTemplateId,
      templateRollMode: activeRollMode,
    } = latestStateRef.current;
    const options = applyProbeStateAlt(rawOptions);
    let { currentInputs } = getInputState();
    // Auto-upload any local-only assets before building each-generation requests
    currentInputs = await ensureInputsUploaded(currentInputs);
    const fanout = normalizeFanoutRunOptions({
      strategy: options?.strategy,
      ...(options?.fanoutOptions || {}),
    });
    const strategy = fanout.strategy;
    const run = createGenerationRunDescriptor({
      mode: 'quickgen_each',
      strategy,
      metadata: {
        repeat_count: fanout.repeatCount,
        dispatch: fanout.dispatch,
        on_error: fanout.onError,
        execution_mode: fanout.executionMode,
        reuse_previous_output_as_input: fanout.reusePreviousOutputAsInput,
        ...(options?.ephemeral ? { ephemeral: true } : {}),
      },
    });

    // ─── Iterate-mode slot path ───
    // Any slot configured with `mode: 'iterate'` becomes a driver: each
    // iteration consumes one item from its linked set. Multiple iterate slots
    // zip by index up to max(setSize), with shorter sets wrapping — except
    // when strategy = `all_pairs` and ≥2 iterate slots exist, in which case
    // the iterate dimension becomes a cartesian product. The selected strategy
    // is also applied across resolved slots within each iteration (e.g.
    // anchor_sweep produces N-1 sub-groups per iteration).
    const hasIterateSlots = currentInputs.some(
      (i: any) => i?.assetSetRef?.mode === 'iterate' && i?.assetSetRef?.setId,
    );
    if (hasIterateSlots) {
      const iterateCache = await preResolveSetRefs(currentInputs);
      resetForGeneration();

      try {
        const baseGroups = buildIterateGroups(
          currentInputs,
          iterateCache,
          strategy,
          fanout.seed,
        );
        if (baseGroups.length === 0) {
          setError('Iterate-mode slots have empty sets');
          setGenerating(false);
          return;
        }
        const groups = expandGroupsByRepeat(baseGroups, fanout.repeatCount);
        const total = groups.length;
        if (total === 0) {
          setError('No iterate runs were planned');
          setGenerating(false);
          return;
        }
        setQueueProgress({ queued: 0, total });

        const probeDefaults = options?.ephemeral
          ? resolveProbeCheapDefaults(activeOperationType, probeStateRef.current.probeParamSource)
          : null;
        const useServerRolling = activeTemplateId && activeRollMode === 'each';
        const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;
        await submitEachViaBackendExecution({
          groups,
          total,
          run,
          strategy,
          probeParams: probeDefaults || {},
          overrideParams: options?.overrideDynamicParams || {},
          rolledOnce,
          onError: fanout.onError,
          executionMode: fanout.executionMode,
          reusePreviousOutputAsInput: fanout.reusePreviousOutputAsInput,
        });
      } catch (err) {
        setError(extractErrorMessage(err, 'Failed to queue iterate-mode generations'));
        setQueueProgress(null);
      } finally {
        setGenerating(false);
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
      const probeDefaults = options?.ephemeral ? getProbeParamOverrides(activeOperationType) : null;

      // Template handling:
      // - 'each' mode: backend rolls per request using run_context
      // - 'once' mode: roll once client-side, pass prompt override for all items
      const useServerRolling = activeTemplateId && activeRollMode === 'each';
      const rolledOnce = !useServerRolling ? await maybeRollTemplate() : null;
      await submitEachViaBackendExecution({
        groups,
        total,
        run,
        strategy,
        probeParams: probeDefaults || {},
        overrideParams: options?.overrideDynamicParams || {},
        rolledOnce,
        onError: fanout.onError,
        executionMode: fanout.executionMode,
        reusePreviousOutputAsInput: fanout.reusePreviousOutputAsInput,
      });
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to queue individual generations'));
      setQueueProgress(null);
    } finally {
      setGenerating(false);
    }
    // Empty deps — same rationale as generateSequentialBurst above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Generate using only the currently selected carousel input (ignores other queued inputs). */
  async function generateCurrentOnly(
    count?: number,
    options?: { ephemeral?: boolean; paramOverrides?: Record<string, any> },
  ) {
    const activeOperationType = getActiveOperationType();

    if (isOnVirtualEmptySlot(activeOperationType)) {
      // No asset on virtual slot — force text-to-* with empty inputs
      return generate({ assetOverrides: [], skipActiveAssetFallback: true, count, ephemeral: options?.ephemeral, paramOverrides: options?.paramOverrides });
    }

    const { currentInput } = getInputState();
    if (!currentInput?.asset) {
      // Empty carousel or no asset — skip gallery fallback so text-to-* kicks in
      return generate({ assetOverrides: [], skipActiveAssetFallback: true, count, ephemeral: options?.ephemeral, paramOverrides: options?.paramOverrides });
    }
    return generate({ assetOverrides: [currentInput.asset], count, ephemeral: options?.ephemeral, paramOverrides: options?.paramOverrides });
  }

  // ─── Stable-ref shells for the action callbacks ──────────────────────────
  // The three plain `async function` declarations above (executeGeneration,
  // generate, generateCurrentOnly) are recreated each render but only ever
  // read changing state via `latestStateRef.current`. We wrap them in
  // `useCallback([], ...)` so the externally-visible refs stay stable across
  // renders — consumers can pass them to `useEffect` deps, `React.memo`'d
  // children, etc., without churn. The first-render closures captured here
  // forward to themselves, so behavior is unchanged.
  // generateSequentialBurst / generateEach are already useCallback-wrapped
  // above (with `[]` deps) — no shell needed.
  const stableExecuteGeneration = useCallback(
    (
      rawOverrides?: GenerateOverrides,
      callbacks?: { onProgress?: (progress: { queued: number; total: number } | null) => void },
    ) => executeGeneration(rawOverrides, callbacks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const stableGenerate = useCallback(
    (overrides?: GenerateOverrides) => generate(overrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const stableGenerateCurrentOnly = useCallback(
    (count?: number, options?: { ephemeral?: boolean; paramOverrides?: Record<string, any> }) =>
      generateCurrentOnly(count, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

    // Actions (referentially stable across renders)
    generate: stableGenerate,
    executeGeneration: stableExecuteGeneration,
    generateCurrentOnly: stableGenerateCurrentOnly,
    generateSequentialBurst,
    generateEach,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Controller context — single mount per scope
// ─────────────────────────────────────────────────────────────────────────────
//
// Background: a typical QuickGen scope (control center, viewer's quickgen
// embed, prompt-authoring workbench) mounts the controller in THREE separate
// React subtrees — PromptPanel, AssetPanel's `useAssetPanelState`, and
// SettingsBlocksPanels — each via dockview-managed panel components. Each
// independent mount runs the 1800-line hook body (16+ store subscriptions,
// many useMemo/useCallback) on every render, so a single keystroke or op-type
// change re-fired 3× the work it needed to.
//
// `<GenerationControllerProvider>` mounts the controller ONCE near the scope
// root (today: inside `QuickGenWidget`, between `GenerationScopeProvider` and
// the panel host). All consumers calling `useQuickGenerateController()` read
// from this context, sharing one hook-body execution per render.
//
// Backwards compatibility: when no provider is mounted (e.g. `MiniGallery`,
// `GenerationPresetsPanel`, tests via `renderHook`), the public hook falls
// back to mounting its own controller. That preserves the previous behavior
// at those call sites — the only consumers that share are the ones that
// actually sit beneath a provider.

export type QuickGenerateController = ReturnType<typeof useQuickGenerateControllerImpl>;

const GenerationControllerContext = createContext<QuickGenerateController | null>(null);
GenerationControllerContext.displayName = 'GenerationControllerContext';

export interface GenerationControllerProviderProps {
  children: ReactNode;
}

/**
 * Mounts ONE `useQuickGenerateController` instance for the scope subtree.
 * Must be rendered inside a `GenerationScopeProvider` (or in the global
 * scope) so the controller binds to the correct scoped stores.
 */
export function GenerationControllerProvider({ children }: GenerationControllerProviderProps) {
  const controller = useQuickGenerateControllerImpl();
  // `createElement` (rather than JSX) keeps this file `.ts` — JSX would
  // require renaming to `.tsx` and updating import paths across consumers.
  return createElement(GenerationControllerContext.Provider, { value: controller }, children);
}

/**
 * Public hook — read the scope's shared controller from context, or fall
 * back to mounting a standalone one if no provider is in the tree. Existing
 * call sites work unchanged: they just get the shared instance instead of
 * a private one when a provider is mounted above them.
 *
 * The hook order changes depending on whether a provider is present, which
 * normally violates the Rules of Hooks. It's safe here because the answer
 * to "is there a provider above me?" is stable for a given consumer's
 * lifetime — a `<GenerationControllerProvider>` doesn't appear or disappear
 * at runtime — so a given component's hook order never changes across its
 * own renders. Cold-path consumers (MiniGallery, GenerationPresetsPanel,
 * useHistoryGalleryItems) sit outside any provider and continue mounting
 * their own controller; hot-path QuickGen panels read from context.
 */
export function useQuickGenerateController(): QuickGenerateController {
  const fromContext = useContext(GenerationControllerContext);
  if (fromContext) return fromContext;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuickGenerateControllerImpl();
}
