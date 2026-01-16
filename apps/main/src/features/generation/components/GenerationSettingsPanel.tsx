/**
 * GenerationSettingsPanel
 *
 * Reusable generation settings panel with operation type, provider,
 * model, quality, duration controls, and Go button with cost estimate.
 *
 * Used by both Control Center and Media Viewer for consistent UI.
 */

import { useCostEstimate, useProviderIdForModel } from '@features/providers';
import clsx from 'clsx';
import {
  Star,
  Zap,
  Clock,
  Camera,
  RotateCcw,
  Film,
  Sparkles,
  ArrowRightLeft,
  ArrowUpDown,
  ZoomIn,
  Gauge,
  Target,
} from 'lucide-react';
import { useMemo, useEffect } from 'react';

import {
  CAP_GENERATION_WIDGET,
  useContextHubHostId,
  useContextHubOverridesStore,
  useContextHubState,
} from '@features/contextHub';
import { AdvancedSettingsPopover } from '@features/controlCenter/components/AdvancedSettingsPopover';
import { useGenerationWorkbench, useGenerationScopeStores } from '@features/generation';


/** Icon configuration for param values - data-driven approach */
const PARAM_ICON_CONFIG: Record<string, Record<string, React.ReactNode>> = {
  quality: {
    // Quality levels
    low: <Star size={14} />,
    medium: (
      <div className="flex gap-0.5">
        <Star size={11} fill="currentColor" />
        <Star size={11} fill="currentColor" />
      </div>
    ),
    high: (
      <div className="flex gap-0.5">
        <Star size={10} fill="currentColor" />
        <Star size={10} fill="currentColor" />
        <Star size={10} fill="currentColor" />
      </div>
    ),
    ultra: <Sparkles size={14} />,
    max: <Sparkles size={14} />,
    // Resolution levels
    '720p': <span className="text-[9px] font-bold">HD</span>,
    hd: <span className="text-[9px] font-bold">HD</span>,
    '1080p': <span className="text-[9px] font-bold">FHD</span>,
    fhd: <span className="text-[9px] font-bold">FHD</span>,
    '4k': <span className="text-[9px] font-bold">4K</span>,
    '8k': <span className="text-[9px] font-bold">8K</span>,
  },
  motion_mode: {
    slow: <Clock size={14} />,
    normal: <Gauge size={14} />,
    medium: <Gauge size={14} />,
    fast: <Zap size={14} />,
    dynamic: <Sparkles size={14} />,
    cinematic: <Film size={14} />,
  },
  camera_movement: {
    static: <Camera size={14} />,
    none: <Camera size={14} />,
    pan: <ArrowRightLeft size={14} />,
    horizontal: <ArrowRightLeft size={14} />,
    tilt: <ArrowUpDown size={14} />,
    vertical: <ArrowUpDown size={14} />,
    zoom: <ZoomIn size={14} />,
    orbit: <RotateCcw size={14} />,
    rotate: <RotateCcw size={14} />,
    dolly: <Film size={14} />,
    track: <Film size={14} />,
  },
};

/** Get icon/visual representation for param values */
function getParamIcon(paramName: string, value: string): React.ReactNode {
  // Aspect ratios - show actual shape representation
  if (paramName === 'aspect_ratio') {
    const [w, h] = value.split(':').map(Number);
    if (!w || !h) return null;

    const isSquare = w === h;
    const isWide = w > h;
    const isTall = w < h;

    return (
      <div className="flex items-center justify-center w-5 h-5">
        <div
          className={clsx(
            'border-2 border-current rounded-sm',
            isSquare && 'w-3.5 h-3.5',
            isWide && 'w-4 h-2.5',
            isTall && 'w-2.5 h-4'
          )}
        />
      </div>
    );
  }

  // Look up icon from config
  const paramConfig = PARAM_ICON_CONFIG[paramName];
  if (paramConfig) {
    const normalizedValue = value.toLowerCase();
    return paramConfig[normalizedValue] || null;
  }

  return null;
}

export interface GenerationSettingsPanelProps {
  /** Whether to show operation type selector (default: true) */
  showOperationType?: boolean;
  /** Whether to show provider selector (default: true) */
  showProvider?: boolean;
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
}

export function GenerationSettingsPanel({
  showOperationType = true,
  showProvider = true,
  targetProviderId,
  generating,
  canGenerate,
  onGenerate,
  className,
  secondaryButton,
  excludeParams = ['image_url', 'image_urls', 'video_url', 'original_video_id', 'source_asset_id', 'source_asset_ids', 'composition_assets', 'negative_prompt', 'prompt'],
  error,
}: GenerationSettingsPanelProps) {
  const { useSessionStore } = useGenerationScopeStores();
  const operationType = useSessionStore(s => s.operationType);
  const providerId = useSessionStore(s => s.providerId);
  const setProvider = useSessionStore(s => s.setProvider);
  const setOperationType = useSessionStore(s => s.setOperationType);
  const hub = useContextHubState();
  const hostId = useContextHubHostId();
  const preferredProviderId = useContextHubOverridesStore(
    (state) => state.getPreferredProviderId(CAP_GENERATION_WIDGET, hostId)
  );
  const setPreferredProvider = useContextHubOverridesStore((state) => state.setPreferredProvider);
  const clearOverride = useContextHubOverridesStore((state) => state.clearOverride);
  const resolvedTargetProviderId = useMemo(() => {
    if (targetProviderId) return targetProviderId;
    if (!hub) return undefined;

    let current = hub;
    while (current) {
      const provider = current.registry.getBest(CAP_GENERATION_WIDGET);
      if (provider?.id) {
        return provider.id;
      }
      current = current.parent;
    }

    return undefined;
  }, [hub, targetProviderId]);
  const isTargeted = !!resolvedTargetProviderId && preferredProviderId === resolvedTargetProviderId;
  const canTarget = !!resolvedTargetProviderId;

  // Use the shared generation workbench hook for settings management
  const workbench = useGenerationWorkbench({ operationType });

  const modelProviderId = useProviderIdForModel(
    workbench.dynamicParams?.model as string | undefined
  );
  const inferredProviderId = providerId ?? modelProviderId;

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
  const durationOptions = useMemo(() => {
    const spec = workbench.paramSpecs.find((p) => p.name === 'duration');
    const metadata = spec?.metadata;
    if (!metadata) return null;

    const normalizeList = (values: unknown): number[] => {
      if (!Array.isArray(values)) return [];
      const unique = new Set<number>();
      for (const v of values) {
        const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : null;
        if (num !== null && Number.isFinite(num)) unique.add(num);
      }
      return Array.from(unique).sort((a, b) => a - b);
    };

    const basePresets = normalizeList(
      metadata.presets ?? metadata.duration_presets ?? metadata.options
    );

    if (!basePresets.length && !metadata.per_model_presets && !metadata.perModelPresets) {
      return null;
    }

    let options = basePresets;
    const perModelPresets =
      (metadata.per_model_presets as Record<string, unknown[]>) ||
      (metadata.perModelPresets as Record<string, unknown[]>);

    const modelValue = workbench.dynamicParams?.model;
    if (perModelPresets && typeof modelValue === 'string') {
      const normalizedModel = modelValue.toLowerCase();
      const matchEntry = Object.entries(perModelPresets).find(
        ([key]) => key.toLowerCase() === normalizedModel
      );
      if (matchEntry) {
        const perModelOptions = normalizeList(matchEntry[1]);
        if (perModelOptions.length) {
          options = perModelOptions;
        }
      }
    }

    return options.length > 0 ? options : null;
  }, [workbench.paramSpecs, workbench.dynamicParams?.model]);

  // Get quality options filtered by model
  const getQualityOptionsForModel = useMemo(() => {
    const spec = workbench.paramSpecs.find((p) => p.name === 'quality');
    if (!spec) return null;

    const metadata = spec.metadata;
    const perModelOptions = metadata?.per_model_options as Record<string, string[]> | undefined;
    const modelValue = workbench.dynamicParams?.model;

    if (perModelOptions && typeof modelValue === 'string') {
      const normalizedModel = modelValue.toLowerCase();
      const matchEntry = Object.entries(perModelOptions).find(
        ([key]) => key.toLowerCase() === normalizedModel
      );
      if (matchEntry) {
        return matchEntry[1];
      }
    }

    return spec.enum ?? null;
  }, [workbench.paramSpecs, workbench.dynamicParams?.model]);

  // Reset quality when model changes and current quality is invalid
  useEffect(() => {
    if (!getQualityOptionsForModel) return;
    const currentQuality = workbench.dynamicParams?.quality;
    if (currentQuality && !getQualityOptionsForModel.includes(currentQuality)) {
      workbench.handleParamChange('quality', getQualityOptionsForModel[0]);
    } else if (!currentQuality && getQualityOptionsForModel.length > 0) {
      workbench.handleParamChange('quality', getQualityOptionsForModel[0]);
    }
  }, [getQualityOptionsForModel, workbench.dynamicParams?.quality, workbench.handleParamChange]);

  const showTargetButton = canTarget;
  const showOperationRow = showOperationType || showTargetButton;

  return (
    <div className={clsx('h-full flex flex-col gap-1.5 p-2 bg-neutral-50 dark:bg-neutral-900 rounded-xl min-h-0', className)}>
      {/* Fixed top section - Operation type & Provider */}
      <div className="flex-shrink-0 flex flex-col gap-1.5">
        {/* Operation type */}
        {showOperationRow && (
          <div className={clsx('flex gap-1', !showOperationType && 'justify-end')}>
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
            {showTargetButton && (
              <button
                type="button"
                onClick={() => {
                  if (!resolvedTargetProviderId) return;
                  if (isTargeted) {
                    clearOverride(CAP_GENERATION_WIDGET, hostId);
                    return;
                  }
                  setPreferredProvider(CAP_GENERATION_WIDGET, resolvedTargetProviderId, hostId);
                }}
                className={clsx(
                  'flex items-center justify-center px-2 py-1.5 rounded-lg border text-[10px] font-medium',
                  isTargeted
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                )}
                title={isTargeted ? 'Targeted for quick add' : 'Target this quick generate for quick add'}
              >
                <Target size={12} />
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

          // Duration with preset buttons
          if (param.name === 'duration' && param.type === 'number' && durationOptions) {
            const currentDuration = Number(workbench.dynamicParams[param.name]) || durationOptions[0];
            return (
              <div key="duration" className="flex flex-wrap gap-1">
                {durationOptions.map((seconds) => (
                  <button
                    type="button"
                    key={seconds}
                    onClick={() => workbench.handleParamChange('duration', seconds)}
                    disabled={generating}
                    className={clsx(
                      'px-2 py-1 rounded-lg text-[11px] font-medium transition-colors',
                      currentDuration === seconds
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-blue-50 dark:hover:bg-neutral-700'
                    )}
                    title={`${seconds} seconds`}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            );
          }

          const COMMON_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
          const options = param.name === 'quality' && getQualityOptionsForModel
            ? getQualityOptionsForModel
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
          const VISUAL_PARAMS = ['aspect_ratio', 'quality', 'motion_mode', 'camera_movement'];
          const isVisualParam = VISUAL_PARAMS.includes(param.name);
          const currentValue = workbench.dynamicParams[param.name] ?? param.default ?? options[0];

          // Show as button grid for visual params
          if (isVisualParam && options.length <= 8) {
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
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        })}
      </div>

      {/* Fixed bottom section - Go button */}
      <div className="flex-shrink-0 flex flex-col gap-1.5 mt-auto">
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
          />

          {/* Primary Go button */}
          <button
            onClick={onGenerate}
            disabled={generating || !canGenerate}
            className={clsx(
              'flex-1 px-2 py-2 rounded-lg text-xs font-semibold text-white',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              generating || !canGenerate
                ? 'bg-neutral-400'
                : error
                ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-400'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
            )}
            style={{ transition: 'none', animation: 'none' }}
          >
            {generating ? (
              '...'
            ) : creditLoading ? (
              'Go'
            ) : creditEstimate !== null ? (
              <span className="flex items-center justify-center gap-1">
                Go <span className="text-amber-200 text-[10px]">+{Math.round(creditEstimate)}</span>
              </span>
            ) : (
              'Go'
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
