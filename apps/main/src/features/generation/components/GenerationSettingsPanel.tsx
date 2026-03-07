/**
 * GenerationSettingsPanel
 *
 * Reusable generation settings panel with operation type, provider,
 * model, quality, duration controls, and Go button with cost estimate.
 *
 * Used by both Control Center and Media Viewer for consistent UI.
 */

import clsx from 'clsx';
import { useMemo, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Icon } from '@lib/icons';

import { useAccentButtonClasses } from '@features/appearance';
import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import {
  CAP_GENERATION_WIDGET,
  useContextHubOverridesStore,
} from '@features/contextHub';
import { useGenerationWorkbench, useGenerationScopeStores, usePersistedScopeState } from '@features/generation';
import { useCostEstimate, useProviderIdForModel, useProviderAccounts, useUnlimitedModels } from '@features/providers';
import { providerCapabilityRegistry } from '@features/providers';

import { OPERATION_METADATA, OPERATION_TYPES, type OperationType } from '@/types/operations';

import type { FanoutRunOptions } from '../lib/fanoutPresets';

import { AdvancedSettingsPopover } from './AdvancedSettingsPopover';
import { EachSplitButton } from './generationSettingsPanel/EachSplitButton';
import { GenerationParamControls } from './generationSettingsPanel/GenerationParamControls';
import {
  filterQuickGenStyleParamSpecs,
  getQuickGenStyleAdvancedParamSpecs,
} from './generationSettingsPanel/generationParamFilters';
import { MaskPicker } from './generationSettingsPanel/MaskPicker';
import { OperationIconButton } from './generationSettingsPanel/OperationIconButton';
import { ProviderIconButton } from './generationSettingsPanel/ProviderIconButton';
import { PresetSelector } from './PresetSelector';

function getModelMatchKeys(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, '');
  const lastSegment = lower.split(/[/:]/).filter(Boolean).at(-1) ?? lower;
  const compactLastSegment = lastSegment.replace(/[\s_-]+/g, '');
  return [trimmed, lower, compact, lastSegment, compactLastSegment];
}

function isModelInUnlimitedSet(unlimitedModels: Set<string>, value: unknown): boolean {
  return getModelMatchKeys(value).some((key) => unlimitedModels.has(key));
}

export interface GenerationSettingsPanelProps {
  /** Whether to show operation type selector (default: true) */
  showOperationType?: boolean;
  /** Whether to show provider selector (default: true) */
  showProvider?: boolean;
  /** Whether to show preset selector (default: true) */
  showPresets?: boolean;
  /** Optional widget provider id to target this panel for quick add */
  targetProviderId?: string;
  /** Whether generation is in progress */
  generating: boolean;
  /** Whether the Go button should be enabled */
  canGenerate: boolean;
  /** Callback when Go button is clicked */
  onGenerate: () => void;
  /** Custom class name for the container */
  className?: string;
  /** Secondary "Go with Asset" button configuration */
  secondaryButton?: {
    /** Callback when secondary Go button is clicked */
    onGenerate: () => void;
    /** Label override (default: "Go") */
    label?: string;
  };
  /** Params to filter out from display (default: ['image_url', 'image_urls', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'composition_assets', 'negative_prompt', 'prompt']) */
  excludeParams?: string[];
  /** Error message to display */
  error?: string | null;
  /** Queue progress state */
  queueProgress?: { queued: number; total: number } | null;
  /** Callback for burst generation (receives count) */
  onGenerateBurst?: (count: number) => void;
  /** Callback for sequential burst generation (waits for each run to complete before the next) */
  onGenerateSequentialBurst?: (count: number) => void;
  /** Callback for generate-each mode (one generation per queued asset or group) */
  onGenerateEach?: (options?: FanoutRunOptions) => void;
  /** Callback to generate using only the currently selected carousel input (receives burst count) */
  onGenerateCurrentOnly?: (count?: number) => void;
  /** Optional node rendered in Row 2 next to Presets (e.g. Asset/My Settings toggle) */
  sourceToggle?: ReactNode;
}

export function GenerationSettingsPanel({
  showOperationType = true,
  showProvider = true,
  showPresets = true,
  targetProviderId,
  generating,
  canGenerate,
  onGenerate,
  className,
  secondaryButton,
  excludeParams = ['image_url', 'image_urls', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'composition_assets', 'negative_prompt', 'prompt', 'mask_url', 'mask_source'],
  error,
  queueProgress,
  onGenerateBurst,
  onGenerateSequentialBurst,
  onGenerateEach,
  onGenerateCurrentOnly,
  sourceToggle,
}: GenerationSettingsPanelProps) {
  const { useSessionStore, useInputStore } = useGenerationScopeStores();
  const operationType = useSessionStore(s => s.operationType);
  const providerId = useSessionStore(s => s.providerId);
  const setProvider = useSessionStore(s => s.setProvider);
  const setOperationType = useSessionStore(s => s.setOperationType);

  // Burst mode - persisted in session store uiState
  const [burstCount, setBurstCount] = usePersistedScopeState('burstCount', 1);
  const [burstSequentialMode, setBurstSequentialMode] = usePersistedScopeState('burstSequentialMode', false);
  const isBurstMode = burstCount > 1;
  const canUseSequentialBurst = !!onGenerateSequentialBurst;

  // Input count from scoped store
  const inputCount = useInputStore(s => s.inputsByOperation[operationType]?.items?.length ?? 0);
  // Read preferred provider directly from state slice for reliable reactivity
  // (getPreferredProviderId uses get() internally which can cause stale selector reads)
  const preferredProviderId = useContextHubOverridesStore(
    (state) => state.overrides[CAP_GENERATION_WIDGET as string]?.preferredProviderId
  );
  const setPreferredProvider = useContextHubOverridesStore((state) => state.setPreferredProvider);
  const clearOverride = useContextHubOverridesStore((state) => state.clearOverride);
  const isTargeted = !!targetProviderId && preferredProviderId === targetProviderId;
  const canTarget = !!targetProviderId;

  // Button style from appearance settings
  const btn = useAccentButtonClasses();

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  const modelProviderId = useProviderIdForModel(
    workbench.dynamicParams?.model as string | undefined
  );
  const inferredProviderId = providerId ?? modelProviderId;

  // Account selector (rendered inside AdvancedSettingsPopover)
  const { accounts: allAccounts } = useProviderAccounts(inferredProviderId);
  const activeAccounts = useMemo(
    () => allAccounts.filter(a => a.status === 'active'),
    [allAccounts]
  );

  // Credit estimation for Go button
  const { estimate: costEstimate, loading: creditLoading } = useCostEstimate({
    providerId: inferredProviderId,
    operationType,
    params: workbench.dynamicParams,
  });
  const creditEstimate = costEstimate?.estimated_credits ?? null;

  // Models that are currently free (unlimited) for the selected account context
  const preferredAccountIdRaw = workbench.dynamicParams?.preferred_account_id;
  const preferredAccountId = (() => {
    if (preferredAccountIdRaw === undefined || preferredAccountIdRaw === null || preferredAccountIdRaw === '') {
      return undefined;
    }
    const n = Number(preferredAccountIdRaw);
    return Number.isFinite(n) ? n : undefined;
  })();
  const unlimitedModels = useUnlimitedModels(preferredAccountId, inferredProviderId);
  const currentModel = workbench.dynamicParams?.model as string | undefined;
  const isModelUnlimited = isModelInUnlimitedSet(unlimitedModels, currentModel);
  const isCurrentGenerationFree = isModelUnlimited || (creditEstimate !== null && creditEstimate <= 0);

  const filteredParamSpecs = useMemo(() => {
    return filterQuickGenStyleParamSpecs(workbench.paramSpecs, operationType, excludeParams);
  }, [operationType, workbench.paramSpecs, excludeParams]);

  const advancedParams = useMemo(() => {
    return getQuickGenStyleAdvancedParamSpecs(filteredParamSpecs);
  }, [filteredParamSpecs]);

  // Mask picker: detect if provider exposes mask_url param
  const hasMaskParam = useMemo(
    () => workbench.allParamSpecs.some((p) => p.name === 'mask_url'),
    [workbench.allParamSpecs],
  );
  // Read mask and asset ID from the current input item (per-asset masks)
  const { currentInputId, currentInputAssetId, currentInputMaskUrl } = useInputStore(
    useShallow((s) => {
      const inputs = s.inputsByOperation[operationType];
      if (!inputs || inputs.items.length === 0) return { currentInputId: null, currentInputAssetId: null, currentInputMaskUrl: undefined };
      const idx = Math.max(0, Math.min(inputs.currentIndex - 1, inputs.items.length - 1));
      const item = inputs.items[idx];
      const id = item?.asset?.id;
      return {
        currentInputId: item?.id ?? null,
        currentInputAssetId: typeof id === 'number' ? id : null,
        currentInputMaskUrl: item?.maskUrl,
      };
    }),
  );
  const setInputMask = useInputStore((s) => s.setInputMask);

  const showTargetButton = canTarget;

  return (
    <div className={clsx('h-full flex flex-col bg-neutral-50 dark:bg-neutral-900 rounded-xl', className)}>
      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
      <div className="gen-panel-content flex flex-col gap-1 p-1.5">
        {/* Row 1: Provider icon, Operation type, Target, Advanced settings */}
        <div className="flex gap-1 items-center">
          {showProvider && (
            <ProviderIconButton
              providerId={providerId}
              providers={workbench.providers}
              onSelect={(id) => {
                setProvider(id);
                // Auto-switch operation if current one isn't supported by the new provider
                if (id && !providerCapabilityRegistry.supportsOperation(id, operationType)) {
                  const fallback = OPERATION_TYPES.find(
                    (op) => OPERATION_METADATA[op].icon && OPERATION_METADATA[op].color
                      && providerCapabilityRegistry.supportsOperation(id, op),
                  );
                  if (fallback) setOperationType(fallback);
                }
              }}
              disabled={generating}
            />
          )}
          {showOperationType && (
            <OperationIconButton
              operationType={operationType}
              onSelect={(op) => setOperationType(op as OperationType)}
              disabled={generating}
              providerId={inferredProviderId}
            />
          )}
          {showTargetButton && (
            <button
              type="button"
              onClick={() => {
                if (!targetProviderId) return;
                if (isTargeted) {
                  clearOverride(CAP_GENERATION_WIDGET);
                  return;
                }
                setPreferredProvider(CAP_GENERATION_WIDGET, targetProviderId);
              }}
              className={clsx(
                'flex items-center justify-center px-2 py-1.5 rounded-lg border text-[10px] font-medium',
                isTargeted
                  ? 'bg-accent border-accent text-accent-text'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
              )}
              title={isTargeted ? 'Targeted for quick add' : 'Target this quick generate for quick add'}
            >
              <Icon name="target" size={12} />
            </button>
          )}
          {sourceToggle && <div className="ml-auto">{sourceToggle}</div>}
        </div>

        {/* Row 2: Generation presets */}
        {showPresets && (
          <div className="flex items-center gap-1">
            <PresetSelector disabled={generating} />
          </div>
        )}

        {/* Mask picker (shown when provider supports mask_url) */}
        {hasMaskParam && currentInputId && (
          <MaskPicker
            maskUrl={currentInputMaskUrl}
            onMaskChange={(url) => setInputMask(operationType, currentInputId, url)}
            hasMaskParam={hasMaskParam}
            sourceAssetId={currentInputAssetId}
            disabled={generating}
          />
        )}

        {/* Dynamic params */}
        <div className="gen-panel-params flex flex-col gap-1">
          <GenerationParamControls
            paramSpecs={filteredParamSpecs}
            values={workbench.dynamicParams}
            onChange={workbench.handleParamChange}
            generating={generating}
            unlimitedModels={unlimitedModels}
          />
        </div>

      </div>
      </div>
      {/* Action area — pinned to bottom */}
      <div className="gen-panel-footer flex-shrink-0 flex flex-col gap-1 px-1.5 pb-1.5 pt-1">
        {/* Queue progress */}
        {queueProgress && (
          <div className="flex items-center gap-2 text-[10px] text-accent">
            <div className="flex-1 bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-accent h-full transition-all duration-300"
                style={{ width: `${(queueProgress.queued / queueProgress.total) * 100}%` }}
              />
            </div>
            <span className="font-medium">{queueProgress.queued}/{queueProgress.total}</span>
          </div>
        )}

        {/* Error message - for prompt rejections only */}
        {error && (
          <div
            className="text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded border border-red-200 dark:border-red-800"
            style={{ transition: 'none', animation: 'none' }}
          >
            Error: {error}
          </div>
        )}

        {/* Action area: Each row + Go row */}
        <div className="gen-panel-action-group quickgen-actions-no-motion flex flex-col gap-1 min-w-0 rounded-xl bg-white/70 dark:bg-neutral-800/60 p-1 shadow-sm ring-1 ring-neutral-200/70 dark:ring-neutral-700/70">
          {/* Generate Each split-button — full width row */}
          {onGenerateEach && (inputCount > 1 || useAssetSetStore.getState().sets.length > 0) && OPERATION_METADATA[operationType].multiAssetMode !== 'required' && (
            <div className="min-w-0">
              <EachSplitButton
                onGenerateEach={onGenerateEach}
                disabled={generating || !canGenerate}
                generating={generating}
                queueProgress={queueProgress}
                inputCount={inputCount}
              />
            </div>
          )}

          <div className="flex items-stretch gap-1.5 min-w-0">
          {/* Advanced settings gear icon */}
          <div className="flex-shrink-0">
            <AdvancedSettingsPopover
              params={advancedParams}
              values={workbench.dynamicParams}
              onChange={workbench.handleParamChange}
              disabled={generating}
              currentModel={workbench.dynamicParams?.model as string | undefined}
              accounts={activeAccounts}
            />
          </div>
          {/* Primary Go button with inline burst stepper */}
          <div
            className="min-w-0 flex flex-1"
            onWheel={(e) => {
              if (generating || !canGenerate) return;
              e.preventDefault();
              if (e.deltaY < 0) {
                setBurstCount((c: number) => Math.min(50, c + 1));
              } else if (e.deltaY > 0) {
                setBurstCount((c: number) => Math.max(1, c - 1));
              }
            }}
          >
            {/* Main Go area */}
            <button
              onClick={() => {
                if (isBurstMode && onGenerateBurst) {
                  if (burstSequentialMode && onGenerateSequentialBurst) {
                    onGenerateSequentialBurst(burstCount);
                  } else {
                    onGenerateBurst(burstCount);
                  }
                } else {
                  onGenerate();
                }
              }}
              disabled={generating || !canGenerate}
              className={clsx(
                'flex-1 px-2 py-1.5 text-xs font-semibold tabular-nums',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'rounded-l-lg',
                generating || !canGenerate
                  ? 'text-white bg-neutral-400'
                  : error
                  ? 'text-white bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                  : btn.primary
              )}
              style={{ transition: 'none', animation: 'none' }}
            >
              {generating ? (
                <span className="inline-flex min-w-[6ch] justify-center">Go</span>
              ) : isCurrentGenerationFree ? (
                <span className="flex min-w-0 items-center justify-center gap-1">
                  <span className="truncate">Go</span>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full bg-emerald-100/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-emerald-100 ring-1 ring-emerald-200/40"
                    title={isModelUnlimited ? "Currently free for the selected account/model" : "Estimated free"}
                  >
                    Free
                  </span>
                </span>
              ) : creditLoading ? (
                'Go'
              ) : creditEstimate !== null ? (
                <span className="flex min-w-0 items-center justify-center gap-1">
                  <span className="truncate">Go</span>
                  <span className="shrink-0 text-amber-200 text-[10px]">
                    +{Math.round(creditEstimate * burstCount)}
                  </span>
                </span>
              ) : (
                isBurstMode && burstSequentialMode && onGenerateSequentialBurst
                  ? 'Go Seq'
                  : 'Go'
              )}
            </button>
            {/* "Current only" split — visible when multiple inputs queued */}
            {onGenerateCurrentOnly && inputCount > 1 && (
              <button
                onClick={() => onGenerateCurrentOnly(isBurstMode ? burstCount : undefined)}
                disabled={generating || !canGenerate}
                className={clsx(
                  'px-1.5 py-1.5 text-[10px] font-semibold border-l border-white/20',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  generating || !canGenerate
                    ? 'text-white bg-neutral-400'
                    : error
                    ? 'text-white bg-red-600 hover:bg-red-700'
                    : btn.primary
                )}
                style={{ transition: 'none', animation: 'none' }}
                title={isBurstMode ? `Generate ${burstCount}x with selected input only` : 'Generate with selected input only'}
              >
                <Icon name="image" size={11} />
              </button>
            )}
            {/* Burst stepper area */}
            <div
              className={clsx(
                'flex flex-col border-l border-white/20 rounded-r-lg min-w-[28px]',
                generating || !canGenerate
                  ? 'text-white bg-neutral-400'
                  : error
                  ? 'text-white bg-red-600'
                  : btn.tertiary,
                (generating || !canGenerate) && 'opacity-50',
              )}
              style={{ transition: 'none', animation: 'none' }}
            >
              <button
                type="button"
                onClick={() => setBurstCount((c: number) => Math.min(50, c + 1))}
                disabled={generating || !canGenerate}
                className="px-1.5 flex-1 flex items-center justify-center hover:bg-white/10 rounded-tr-lg disabled:cursor-not-allowed"
              >
                <Icon name="chevronUp" size={10} />
              </button>
              <button
                type="button"
                onClick={() => canUseSequentialBurst && setBurstSequentialMode((v: boolean) => !v)}
                disabled={generating || !canGenerate || !canUseSequentialBurst}
                className={clsx(
                  'text-[11px] font-mono text-center leading-none px-1.5 py-0.5',
                  burstSequentialMode && canUseSequentialBurst ? 'bg-white/15' : '',
                  canUseSequentialBurst ? 'hover:bg-white/10' : '',
                  'disabled:cursor-not-allowed',
                )}
                title={
                  canUseSequentialBurst
                    ? (burstSequentialMode
                        ? 'Sequential burst: wait for each run to finish before starting the next'
                        : 'Burst mode: queue all runs immediately (click to toggle sequential)')
                    : 'Sequential burst not available in this context'
                }
              >
                {burstCount}{burstSequentialMode && canUseSequentialBurst ? 'S' : ''}
              </button>
              <button
                type="button"
                onClick={() => setBurstCount((c: number) => Math.max(1, c - 1))}
                disabled={generating || !canGenerate || burstCount <= 1}
                className="px-1.5 flex-1 flex items-center justify-center hover:bg-white/10 rounded-br-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="chevronDown" size={10} />
              </button>
            </div>
          </div>

          {/* Secondary Go button (with media viewer asset) */}
          {secondaryButton && (
            <button
              onClick={secondaryButton.onGenerate}
              disabled={generating || !canGenerate}
              className={clsx(
                'min-w-0 px-2 py-1.5 rounded-lg text-xs font-semibold tabular-nums',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                generating || !canGenerate
                  ? 'text-white bg-neutral-400'
                  : error
                  ? 'text-white bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                  : btn.secondary
              )}
              style={{ transition: 'none', animation: 'none' }}
              title="Generate using Media Viewer asset"
            >
              {generating ? (
                (secondaryButton.label || 'Go')
              ) : isCurrentGenerationFree ? (
                <span className="flex min-w-0 items-center justify-center gap-1">
                  <span className="truncate">{secondaryButton.label || 'Go'}</span>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full bg-emerald-100/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-emerald-100 ring-1 ring-emerald-200/40"
                    title={isModelUnlimited ? "Currently free for the selected account/model" : "Estimated free"}
                  >
                    Free
                  </span>
                </span>
              ) : creditLoading ? (
                secondaryButton.label || 'Go'
              ) : creditEstimate !== null ? (
                <span className="flex min-w-0 items-center justify-center gap-1">
                  <span className="truncate">{secondaryButton.label || 'Go'}</span>
                  <span className="shrink-0 text-amber-200 text-[10px]">+{Math.round(creditEstimate)}</span>
                </span>
              ) : (
                secondaryButton.label || 'Go'
              )}
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
