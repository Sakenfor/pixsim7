/**
 * GenerationSettingsPanel
 *
 * Reusable generation settings panel with operation type, provider,
 * model, quality, duration controls, and Go button with cost estimate.
 *
 * Used by both Control Center and Media Viewer for consistent UI.
 */

import clsx from 'clsx';
import { useMemo, useEffect, type ReactNode } from 'react';

import {
  getDurationOptions,
  getQualityOptions,
  getAspectRatioLabel,
  COMMON_ASPECT_RATIOS,
  getParamIcon,
  isVisualParam,
} from '@lib/generation-ui';
import { Icon } from '@lib/icons';

import { useAssetSetStore } from '@features/assets/stores/assetSetStore';
import {
  CAP_GENERATION_WIDGET,
  useContextHubOverridesStore,
} from '@features/contextHub';
import { useGenerationWorkbench, useGenerationScopeStores, usePersistedScopeState } from '@features/generation';
import { useCostEstimate, useProviderIdForModel, useProviderAccounts, useUnlimitedModels } from '@features/providers';

import { OPERATION_METADATA } from '@/types/operations';

import type { CombinationStrategy } from '../lib/combinationStrategies';

import { AdvancedSettingsPopover } from './AdvancedSettingsPopover';
import { AspectRatioDropdown } from './generationSettingsPanel/AspectRatioDropdown';
import { EachSplitButton } from './generationSettingsPanel/EachSplitButton';
import { OperationIconButton } from './generationSettingsPanel/OperationIconButton';
import { ProviderIconButton } from './generationSettingsPanel/ProviderIconButton';
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
  /** Callback for generate-each mode (one generation per queued asset or group) */
  onGenerateEach?: (strategy?: CombinationStrategy, setId?: string) => void;
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
  onGenerateEach,
  sourceToggle,
}: GenerationSettingsPanelProps) {
  const { useSessionStore, useInputStore } = useGenerationScopeStores();
  const operationType = useSessionStore(s => s.operationType);
  const providerId = useSessionStore(s => s.providerId);
  const setProvider = useSessionStore(s => s.setProvider);
  const setOperationType = useSessionStore(s => s.setOperationType);

  // Burst mode - persisted in session store uiState
  const [burstCount, setBurstCount] = usePersistedScopeState('burstCount', 1);
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
  const preferredAccountId = workbench.dynamicParams?.preferred_account_id;
  const unlimitedModels = useUnlimitedModels(preferredAccountId, inferredProviderId);
  const currentModel = workbench.dynamicParams?.model as string | undefined;
  const isModelUnlimited = !!currentModel && unlimitedModels.has(currentModel);

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

  return (
    <div className={clsx('h-full overflow-y-auto thin-scrollbar bg-neutral-50 dark:bg-neutral-900 rounded-xl', className)}>
      <div className="flex flex-col gap-1 p-1.5">
        {/* Row 1: Provider icon, Operation type, Target, Advanced settings */}
        <div className="flex gap-1 items-center">
          {showProvider && (
            <ProviderIconButton
              providerId={providerId}
              providers={workbench.providers}
              onSelect={(id) => setProvider(id)}
              disabled={generating}
            />
          )}
          {showOperationType && (
            <OperationIconButton
              operationType={operationType}
              onSelect={(op) => setOperationType(op as any)}
              disabled={generating}
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

        {/* Mask attached indicator */}
        {workbench.dynamicParams?.mask_url && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-accent/15 border border-accent/30">
            <Icon name="paintbrush" size={11} className="text-accent" />
            <span className="text-[11px] text-accent font-medium">Mask attached</span>
            <button
              type="button"
              onClick={() => workbench.handleParamChange('mask_url', undefined)}
              className="ml-auto p-0.5 rounded hover:bg-accent/30 text-accent hover:text-accent-hover transition-colors"
              title="Remove mask"
            >
              <Icon name="x" size={10} />
            </button>
          </div>
        )}

        {/* Dynamic params */}
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
            : (param.enum && param.enum.length > 0)
              ? param.enum
              : (param.name === 'aspect_ratio' ? COMMON_ASPECT_RATIOS : null);

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

          // Aspect ratio: dropdown picker
          if (param.name === 'aspect_ratio') {
            return (
              <AspectRatioDropdown
                key={param.name}
                options={options}
                currentValue={currentValue}
                onChange={(val) => workbench.handleParamChange(param.name, val)}
                disabled={generating}
              />
            );
          }

          // Show as button grid for visual params
          const isIconOnly = param.name === 'quality';
          const gridLimit = isIconOnly ? 14 : 8;
          if (showAsVisualGrid && options.length <= gridLimit) {
            return (
              <div key={param.name} className="flex flex-wrap gap-1">
                {options.map((opt: string) => {
                  const icon = getParamIcon(param.name, opt);
                  const isSelected = currentValue === opt;
                  const isFreeModel = param.name === 'model' && unlimitedModels.has(opt);

                  return (
                    <button
                      type="button"
                      key={opt}
                      onClick={() => workbench.handleParamChange(param.name, opt)}
                      disabled={generating}
                      className={clsx(
                        'rounded-lg text-[11px] font-medium transition-colors duration-200',
                        'flex items-center',
                        isIconOnly ? 'px-1.5 py-1 justify-center' : 'px-2 py-1 gap-1.5',
                        isSelected
                          ? 'bg-accent text-accent-text shadow-sm'
                          : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-accent-subtle dark:hover:bg-neutral-700'
                      )}
                      title={isFreeModel ? `${opt} (currently free)` : opt}
                    >
                      {icon}
                      {!isIconOnly && <span>{opt}</span>}
                      {isFreeModel && (
                        <span className={clsx(
                          'px-1 py-px rounded text-[8px] font-bold leading-none',
                          isSelected
                            ? 'bg-green-300/30 text-green-100'
                            : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                        )}>
                          free
                        </span>
                      )}
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
              {options.map((opt: string) => {
                const label = param.name === 'aspect_ratio' ? getAspectRatioLabel(opt) : opt;
                const isFree = param.name === 'model' && unlimitedModels.has(opt);
                return (
                  <option key={opt} value={opt}>
                    {isFree ? `${label} (free)` : label}
                  </option>
                );
              })}
            </select>
          );
        })}

        {/* Go button — sticky so it stays visible when scrolling */}
        <div className="sticky bottom-0 flex flex-col gap-1 -mx-1.5 px-1.5 pb-1.5 pt-1 bg-neutral-50 dark:bg-neutral-900">
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

        {/* Action row: gear, burst, queued, [Each], Go, [Secondary] */}
        <div className="flex items-center gap-1.5 min-w-0">
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

          {/* Generate Each split-button — visible with 2+ inputs or when sets exist */}
          {onGenerateEach && (inputCount > 1 || useAssetSetStore.getState().sets.length > 0) && OPERATION_METADATA[operationType].multiAssetMode !== 'required' && (
            <EachSplitButton
              onGenerateEach={onGenerateEach}
              disabled={generating || !canGenerate}
              generating={generating}
              queueProgress={queueProgress}
            />
          )}

          {/* Primary Go button with inline burst stepper */}
          <div className="flex-1 min-w-[52px] flex-shrink-0 flex">
            {/* Main Go area */}
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
                'flex-1 px-2 py-1.5 text-xs font-semibold text-white',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                burstCount > 1 ? 'rounded-l-lg' : 'rounded-lg',
                generating || !canGenerate
                  ? 'bg-neutral-400'
                  : error
                  ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                  : 'bg-accent hover:bg-accent-hover'
              )}
              style={{ transition: 'none', animation: 'none' }}
            >
              {generating ? (
                queueProgress ? `${queueProgress.queued}/${queueProgress.total}` : '...'
              ) : creditLoading ? (
                'Go'
              ) : creditEstimate !== null ? (
                <span className="flex items-center justify-center gap-1">
                  Go
                  {isModelUnlimited ? (
                    <span className="text-green-200 text-[10px]" title="Currently free for this account">
                      <span className="line-through opacity-50">+{Math.round(creditEstimate * burstCount)}</span>
                    </span>
                  ) : (
                    <span className="text-amber-200 text-[10px]">
                      +{Math.round(creditEstimate * burstCount)}
                    </span>
                  )}
                </span>
              ) : (
                'Go'
              )}
            </button>
            {/* Burst stepper area */}
            <div
              className={clsx(
                'flex flex-col border-l border-white/20 rounded-r-lg text-white',
                generating || !canGenerate
                  ? 'bg-neutral-400'
                  : error
                  ? 'bg-red-600'
                  : 'bg-accent',
                (generating || !canGenerate) && 'opacity-50',
              )}
              style={{ transition: 'none', animation: 'none' }}
            >
              <button
                type="button"
                onClick={() => setBurstCount((c: number) => Math.min(50, c + 1))}
                disabled={generating || !canGenerate}
                className="px-1 flex-1 flex items-center justify-center hover:bg-white/10 rounded-tr-lg disabled:cursor-not-allowed"
              >
                <Icon name="chevronUp" size={8} />
              </button>
              <span className="text-[9px] font-mono text-center leading-none px-1">{burstCount}</span>
              <button
                type="button"
                onClick={() => setBurstCount((c: number) => Math.max(1, c - 1))}
                disabled={generating || !canGenerate || burstCount <= 1}
                className="px-1 flex-1 flex items-center justify-center hover:bg-white/10 rounded-br-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="chevronDown" size={8} />
              </button>
            </div>
          </div>

          {/* Secondary Go button (with media viewer asset) */}
          {secondaryButton && (
            <button
              onClick={secondaryButton.onGenerate}
              disabled={generating || !canGenerate}
              className={clsx(
                'flex-1 min-w-[48px] flex-shrink-0 px-2 py-1.5 rounded-lg text-xs font-semibold text-white',
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
                  {secondaryButton.label || 'Go'}
                  {isModelUnlimited ? (
                    <span className="text-green-200 text-[10px]" title="Currently free for this account">
                      <span className="line-through opacity-50">+{Math.round(creditEstimate)}</span>
                    </span>
                  ) : (
                    <span className="text-amber-200 text-[10px]">+{Math.round(creditEstimate)}</span>
                  )}
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
