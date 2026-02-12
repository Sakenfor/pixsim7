/**
 * GenerationSettingsPanel
 *
 * Reusable generation settings panel with operation type, provider,
 * model, quality, duration controls, and Go button with cost estimate.
 *
 * Used by both Control Center and Media Viewer for consistent UI.
 */

import clsx from 'clsx';
import { useMemo, useEffect, useState } from 'react';

import {
  getDurationOptions,
  getQualityOptions,
  getAspectRatioLabel,
  COMMON_ASPECT_RATIOS,
  getParamIcon,
  isVisualParam,
} from '@lib/generation-ui';
import { Icon } from '@lib/icons';

import {
  CAP_GENERATION_WIDGET,
  useContextHubOverridesStore,
} from '@features/contextHub';
import { useGenerationWorkbench, useGenerationScopeStores } from '@features/generation';
import { useCostEstimate, useProviderIdForModel, useProviderAccounts } from '@features/providers';

import { OPERATION_METADATA } from '@/types/operations';

import { AdvancedSettingsPopover } from './AdvancedSettingsPopover';
import { PresetSelector } from './PresetSelector';

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
  /** Callback for generate-each mode (one generation per queued asset) */
  onGenerateEach?: () => void;
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
  excludeParams = ['image_url', 'image_urls', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'composition_assets', 'negative_prompt', 'prompt'],
  error,
  queueProgress,
  onGenerateBurst,
  onGenerateEach,
}: GenerationSettingsPanelProps) {
  const { useSessionStore, useInputStore } = useGenerationScopeStores();
  const operationType = useSessionStore(s => s.operationType);
  const providerId = useSessionStore(s => s.providerId);
  const setProvider = useSessionStore(s => s.setProvider);
  const setOperationType = useSessionStore(s => s.setOperationType);

  // Burst mode - local state (not persisted in session store)
  const [burstCount, setBurstCount] = useState(1);
  const isBurstMode = burstCount > 1;

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

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  const modelProviderId = useProviderIdForModel(
    workbench.dynamicParams?.model as string | undefined
  );
  const inferredProviderId = providerId ?? modelProviderId;

  // Account selector
  const { accounts: allAccounts } = useProviderAccounts(inferredProviderId);
  const activeAccounts = useMemo(
    () => allAccounts.filter(a => a.status === 'active'),
    [allAccounts]
  );
  const selectedAccountId = workbench.dynamicParams?.preferred_account_id ?? '';

  // Credit estimation for Go button
  const { estimate: costEstimate, loading: creditLoading } = useCostEstimate({
    providerId: inferredProviderId,
    operationType,
    params: workbench.dynamicParams,
  });
  const creditEstimate = costEstimate?.estimated_credits ?? null;

  // Filter params based on operation type
  const filteredParamSpecs = useMemo(() => {
    const hideParams = new Set<string>();

    if (operationType === 'video_transition') {
      hideParams.add('duration');
    }

    // Operations that inherit aspect ratio from source (don't support custom aspect_ratio)
    const INHERITS_ASPECT_RATIO = new Set(['image_to_video', 'video_extend']);
    if (INHERITS_ASPECT_RATIO.has(operationType)) {
      hideParams.add('aspect_ratio');
    }

    // Add excluded params
    excludeParams.forEach(p => hideParams.add(p));

    if (hideParams.size === 0) {
      return workbench.paramSpecs;
    }

    return workbench.paramSpecs.filter(p => !hideParams.has(p.name));
  }, [operationType, workbench.paramSpecs, excludeParams]);

  // Advanced params: those not shown in the main settings panel
  const advancedParams = useMemo(() => {
    const PRIMARY_PARAMS = ['model', 'quality', 'duration', 'aspect_ratio', 'motion_mode', 'camera_movement'];
    const HIDDEN_PARAMS = ['image_url', 'image_urls', 'prompt', 'prompts', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'composition_assets'];

    return filteredParamSpecs.filter(p => {
      if (PRIMARY_PARAMS.includes(p.name)) return false;
      if (HIDDEN_PARAMS.includes(p.name)) return false;
      return true;
    });
  }, [filteredParamSpecs]);

  // Get duration presets from param specs metadata
  const durationOptions = useMemo(
    () => getDurationOptions(workbench.paramSpecs, workbench.dynamicParams?.model)?.options ?? null,
    [workbench.paramSpecs, workbench.dynamicParams?.model]
  );

  // Get quality options filtered by model
  const qualityOptionsForModel = useMemo(
    () => getQualityOptions(workbench.paramSpecs, workbench.dynamicParams?.model),
    [workbench.paramSpecs, workbench.dynamicParams?.model]
  );

  // Reset quality when model changes and current quality is invalid
  useEffect(() => {
    if (!qualityOptionsForModel) return;
    const currentQuality = workbench.dynamicParams?.quality;
    if (currentQuality && !qualityOptionsForModel.includes(currentQuality)) {
      workbench.handleParamChange('quality', qualityOptionsForModel[0]);
    } else if (!currentQuality && qualityOptionsForModel.length > 0) {
      workbench.handleParamChange('quality', qualityOptionsForModel[0]);
    }
  }, [qualityOptionsForModel, workbench.dynamicParams?.quality, workbench.handleParamChange]);

  const showTargetButton = canTarget;
  const showOperationRow = showOperationType || showTargetButton || showPresets;

  return (
    <div className={clsx('h-full flex flex-col gap-1.5 p-2 bg-neutral-50 dark:bg-neutral-900 rounded-xl min-h-0', className)}>
      {/* Fixed top section - Operation type & Provider */}
      <div className="flex-shrink-0 flex flex-col gap-1.5">
        {/* Operation type & Presets */}
        {showOperationRow && (
          <div className={clsx('flex gap-1', !showOperationType && !showPresets && 'justify-end')}>
            {showOperationType && (
              <select
                value={operationType}
                onChange={(e) => setOperationType(e.target.value as any)}
                disabled={generating}
                className="flex-1 px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm font-medium"
              >
                <option value="image_to_image">Image</option>
                <option value="image_to_video">Video</option>
                <option value="video_extend">Extend</option>
                <option value="video_transition">Transition</option>
                <option value="fusion">Fusion</option>
              </select>
            )}
            {showPresets && (
              <PresetSelector
                disabled={generating}
              />
            )}
            {activeAccounts.length > 0 && (
              <select
                value={selectedAccountId}
                onChange={(e) => workbench.handleParamChange('preferred_account_id', e.target.value ? Number(e.target.value) : undefined)}
                disabled={generating}
                className="w-20 px-1 py-1.5 text-[10px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm truncate"
                title="Account"
              >
                <option value="">Auto</option>
                {activeAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.nickname || a.email}</option>
                ))}
              </select>
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
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                )}
                title={isTargeted ? 'Targeted for quick add' : 'Target this quick generate for quick add'}
              >
                <Icon name="target" size={12} />
              </button>
            )}
          </div>
        )}

        {/* Provider */}
        {showProvider && (
          <select
            value={providerId || ''}
            onChange={(e) => setProvider(e.target.value || undefined)}
            disabled={generating}
            className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
            title="Provider"
          >
            <option value="">Auto</option>
            {workbench.providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Scrollable middle section - Dynamic params */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 min-h-0">
        {filteredParamSpecs.map(param => {
          if (param.type === 'boolean') return null;
          if (param.type === 'string' && !param.enum) return null;

          // Duration dropdown
          if (param.name === 'duration' && param.type === 'number' && durationOptions) {
            const currentDuration = Number(workbench.dynamicParams[param.name]) || durationOptions[0];
            return (
              <select
                key="duration"
                value={currentDuration}
                onChange={(e) => workbench.handleParamChange('duration', Number(e.target.value))}
                disabled={generating}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
                title="Duration"
              >
                {durationOptions.map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds}s</option>
                ))}
              </select>
            );
          }

          const options = param.name === 'quality' && qualityOptionsForModel
            ? qualityOptionsForModel
            : param.enum ?? (param.name === 'aspect_ratio' ? COMMON_ASPECT_RATIOS : null);

          if (param.type === 'number' && !options) {
            return (
              <input
                key={param.name}
                type="number"
                value={workbench.dynamicParams[param.name] ?? param.default ?? ''}
                onChange={(e) => workbench.handleParamChange(param.name, e.target.value === '' ? undefined : Number(e.target.value))}
                disabled={generating}
                placeholder={param.name}
                className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
                title={param.name}
              />
            );
          }

          if (!options) return null;

          // Visual params that should show as button grids with icons
          const showAsVisualGrid = isVisualParam(param.name);
          const currentValue = workbench.dynamicParams[param.name] ?? param.default ?? options[0];

          // Show as button grid for visual params
          if (showAsVisualGrid && options.length <= 8) {
            return (
              <div key={param.name} className="flex flex-wrap gap-1">
                {options.map((opt: string) => {
                  const icon = getParamIcon(param.name, opt);
                  const isSelected = currentValue === opt;

                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => workbench.handleParamChange(param.name, opt)}
                      disabled={generating}
                      className={clsx(
                        'px-2 py-1 rounded-lg text-[11px] font-medium transition-colors duration-200',
                        'flex items-center gap-1.5',
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-blue-50 dark:hover:bg-neutral-700'
                      )}
                      title={opt}
                    >
                      {icon}
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
            );
          }

          // Fallback to dropdown for non-visual params or long lists
          return (
            <select
              key={param.name}
              value={currentValue}
              onChange={(e) => workbench.handleParamChange(param.name, e.target.value)}
              disabled={generating}
              className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
              title={param.name}
            >
              {options.map((opt: string) => (
                <option key={opt} value={opt}>
                  {param.name === 'aspect_ratio' ? getAspectRatioLabel(opt) : opt}
                </option>
              ))}
            </select>
          );
        })}
      </div>

      {/* Fixed bottom section - Go button */}
      <div className="flex-shrink-0 flex flex-col gap-1.5 mt-auto">
        {/* Burst count input + queued inputs display */}
        <div className="flex items-center justify-between gap-2 text-[10px]">
          {/* Burst count input */}
          <div className="flex items-center gap-1">
            <Icon name="layers" size={12} className="text-neutral-500" />
            <input
              type="number"
              min={1}
              max={50}
              value={burstCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setBurstCount(Math.max(1, Math.min(50, val)));
              }}
              disabled={generating}
              className={clsx(
                'w-12 px-2 py-1 rounded-md font-medium border-0 shadow-sm text-center',
                isBurstMode
                  ? 'bg-purple-600 text-white'
                  : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
              )}
              title="Number of generations to run"
            />
            <span className="text-neutral-500">×</span>
          </div>

          {/* Queued inputs indicator */}
          {inputCount > 0 && (
            <div className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
              <span>Queued:</span>
              <span className="font-mono text-blue-600 dark:text-blue-400">
                {inputCount}
              </span>
            </div>
          )}
        </div>

        {/* Queue progress */}
        {queueProgress && (
          <div className="flex items-center gap-2 text-[10px] text-purple-600 dark:text-purple-400">
            <div className="flex-1 bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-purple-600 h-full transition-all duration-300"
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

        <div className="flex gap-1.5">
          {/* Advanced settings gear icon */}
          <AdvancedSettingsPopover
            params={advancedParams}
            values={workbench.dynamicParams}
            onChange={workbench.handleParamChange}
            disabled={generating}
            currentModel={workbench.dynamicParams?.model as string | undefined}
          />

          {/* Generate Each button - one generation per queued asset */}
          {onGenerateEach && inputCount > 1 && OPERATION_METADATA[operationType].multiAssetMode !== 'required' && (
            <button
              onClick={onGenerateEach}
              disabled={generating || !canGenerate}
              className={clsx(
                'px-2 py-2 rounded-lg text-xs font-semibold text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                generating || !canGenerate
                  ? 'bg-neutral-400'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600'
              )}
              style={{ transition: 'none', animation: 'none' }}
              title="Generate individually for each queued asset"
            >
              {generating && queueProgress ? `${queueProgress.queued}/${queueProgress.total}` : 'Each'}
            </button>
          )}

          {/* Primary Go button */}
          <button
            onClick={() => {
              if (isBurstMode && onGenerateBurst) {
                onGenerateBurst(burstCount);
              } else {
                onGenerate();
              }
            }}
            disabled={generating || !canGenerate}
            className={clsx(
              'flex-1 px-2 py-2 rounded-lg text-xs font-semibold text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              generating || !canGenerate
                ? 'bg-neutral-400'
                : error
                ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                : isBurstMode
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
            )}
            style={{ transition: 'none', animation: 'none' }}
          >
            {generating ? (
              queueProgress ? `${queueProgress.queued}/${queueProgress.total}` : '...'
            ) : creditLoading ? (
              isBurstMode ? `Go x${burstCount}` : 'Go'
            ) : creditEstimate !== null ? (
              <span className="flex items-center justify-center gap-1">
                {isBurstMode ? `Go x${burstCount}` : 'Go'}
                <span className="text-amber-200 text-[10px]">
                  +{Math.round(creditEstimate * burstCount)}
                </span>
              </span>
            ) : (
              isBurstMode ? `Go x${burstCount}` : 'Go'
            )}
          </button>

          {/* Secondary Go button (with media viewer asset) */}
          {secondaryButton && (
            <button
              onClick={secondaryButton.onGenerate}
              disabled={generating || !canGenerate}
              className={clsx(
                'flex-1 px-2 py-2 rounded-lg text-xs font-semibold text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                generating || !canGenerate
                  ? 'bg-neutral-400'
                  : error
                  ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
              )}
              style={{ transition: 'none', animation: 'none' }}
              title="Generate using Media Viewer asset"
            >
              {generating ? (
                '...'
              ) : creditLoading ? (
                secondaryButton.label || 'Go'
              ) : creditEstimate !== null ? (
                <span className="flex items-center justify-center gap-1">
                  {secondaryButton.label || 'Go'} <span className="text-amber-200 text-[10px]">+{Math.round(creditEstimate)}</span>
                </span>
              ) : (
                secondaryButton.label || 'Go'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
