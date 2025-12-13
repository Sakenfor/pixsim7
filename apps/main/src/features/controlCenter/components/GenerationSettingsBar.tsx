import React, { useMemo, useState, useEffect } from 'react';
import clsx from 'clsx';
import type { ParamSpec } from './DynamicParamForm';
import { useCostHints } from '@features/providers';
import { estimatePixverseCost } from '@features/providers';

/**
 * Provider option for the provider selector dropdown.
 */
interface ProviderOption {
  id: string;
  name: string;
}

// Some sandboxes tree-shake named hooks aggressively. Fall back to React.useEffect
// when the direct import isn't available at runtime.
const useEffectHook = typeof useEffect === 'function' ? useEffect : React.useEffect;

/**
 * Props for the GenerationSettingsBar component.
 *
 * This component provides a compact, horizontal settings bar for generation
 * parameters. It's designed to be reusable across different generation UIs
 * (QuickGenerateModule, IntimacySceneComposer, dev tools, etc.).
 *
 * Usage:
 * ```tsx
 * <GenerationSettingsBar
 *   providerId={providerId}
 *   providers={providers}
 *   paramSpecs={paramSpecs}
 *   dynamicParams={dynamicParams}
 *   onChangeParam={(name, value) => setDynamicParams(prev => ({...prev, [name]: value}))}
 *   onChangeProvider={(id) => setProviderId(id)}
 *   generating={generating}
 *   showSettings={showSettings}
 *   onToggleSettings={() => setShowSettings(!showSettings)}
 * />
 * ```
 */
export interface GenerationSettingsBarProps {
  /** Currently selected provider ID, or undefined for "Auto" */
  providerId?: string;
  /** List of available providers to show in the dropdown */
  providers: ProviderOption[];
  /** Parameter specifications from the provider's operation_specs */
  paramSpecs: ParamSpec[];
  /** Current dynamic parameter values */
  dynamicParams: Record<string, any>;
  /** Callback when a parameter value changes */
  onChangeParam: (name: string, value: any) => void;
  /** Callback when provider selection changes (cleaner than using __provider__ sentinel) */
  onChangeProvider?: (providerId: string | undefined) => void;
  /** Whether generation is in progress (disables inputs) */
  generating?: boolean;
  /** Whether the settings bar is expanded/visible */
  showSettings: boolean;
  /** Callback to toggle settings visibility */
  onToggleSettings: () => void;
  /** Currently active preset ID (shown as a badge) */
  presetId?: string;
  /** Optional operation type (used for cost estimation heuristics) */
  operationType?: string;
}

// Primary: common user-facing options that should be immediately visible
const PRIMARY_PARAM_NAMES = [
  'duration',
  'quality',
  'aspect_ratio',
  'model',
  'model_version',
  'seconds',
  'style',
  'resolution',
];

type DurationOptionConfig = {
  options: number[];
  note?: string;
};

const PIXVERSE_VIDEO_MODELS = ['v3.5', 'v4', 'v5', 'v5.5', 'v6'];

function isPixverseModel(model: unknown): boolean {
  if (typeof model !== 'string') return false;
  const normalized = model.toLowerCase();
  return PIXVERSE_VIDEO_MODELS.some((prefix) => normalized.startsWith(prefix));
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizePresetList(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<number>();
  for (const value of values) {
    const coerced = coerceNumber(value);
    if (coerced !== null) {
      unique.add(coerced);
    }
  }
  return Array.from(unique).sort((a, b) => a - b);
}

function getDurationOptionsFromSpecs(
  paramSpecs: ParamSpec[],
  modelValue: unknown
): DurationOptionConfig | null {
  const spec = paramSpecs.find((p) => p.name === 'duration');
  const metadata = spec?.metadata;
  if (!metadata) {
    return null;
  }

  const note: string | undefined =
    metadata.duration_note ||
    metadata.note ||
    metadata.presetNote;
  const basePresets = normalizePresetList(
    metadata.presets ?? metadata.duration_presets ?? metadata.options
  );

  if (!basePresets.length && !metadata.per_model_presets && !metadata.perModelPresets) {
    return null;
  }

  let options = basePresets;
  const perModelPresets =
    (metadata.per_model_presets as Record<string, unknown[]>) ||
    (metadata.perModelPresets as Record<string, unknown[]>);

  if (perModelPresets && typeof modelValue === 'string') {
    const normalizedModel = modelValue.toLowerCase();
    const matchEntry = Object.entries(perModelPresets).find(
      ([key]) => key.toLowerCase() === normalizedModel
    );
    if (matchEntry) {
      const perModelOptions = normalizePresetList(matchEntry[1]);
      if (perModelOptions.length) {
        options = perModelOptions;
      }
    }
  }

  if (!options.length) {
    options = basePresets;
  }

  if (!options.length) {
    return null;
  }

  return {
    options,
    note,
  };
}

/**
 * GenerationSettingsBar
 *
 * A compact, horizontal settings bar for generation parameters.
 * Displays primary parameters (model, quality, aspect_ratio, etc.) as inline
 * dropdowns, with advanced parameters (booleans, seed, etc.) in a popover.
 *
 * This component is provider-agnostic - it works with any provider that
 * returns operation_specs with parameters. The split between primary and
 * advanced is based on PRIMARY_PARAM_NAMES and whether the param has an enum.
 *
 * @example
 * // In QuickGenerateModule:
 * <GenerationSettingsBar
 *   providerId={providerId}
 *   providers={providers}
 *   paramSpecs={paramSpecs}
 *   dynamicParams={dynamicParams}
 *   onChangeParam={handleDynamicParamChange}
 *   onChangeProvider={setProvider}
 *   generating={generating}
 *   showSettings={showSettings}
 *   onToggleSettings={() => setShowSettings(!showSettings)}
 *   presetId={presetId}
 * />
 */
export function GenerationSettingsBar({
  providerId,
  providers,
  paramSpecs,
  dynamicParams,
  onChangeParam,
  onChangeProvider,
  generating = false,
  showSettings,
  onToggleSettings,
  presetId,
  operationType,
  }: GenerationSettingsBarProps) {
  const [expandedSetting, setExpandedSetting] = useState<string | null>(null);
  const inferredProviderId =
    providerId || (isPixverseModel(dynamicParams.model) ? 'pixverse' : undefined);
  const costHints = useCostHints(inferredProviderId);
  const [creditEstimate, setCreditEstimate] = useState<number | null>(null);
  const [creditEstimateLoading, setCreditEstimateLoading] = useState(false);
  const durationOptions = useMemo(
    () => getDurationOptionsFromSpecs(paramSpecs, dynamicParams.model),
    [paramSpecs, dynamicParams.model]
  );

  // Primary params: shown directly in the bar as inline controls.
  // - Enum-based fields like model/quality use selects.
  // - duration and aspect_ratio are always primary (even without enum).
  const ALWAYS_PRIMARY = ['duration', 'aspect_ratio'];
  const primaryParams = useMemo(
    () =>
      paramSpecs.filter((p) =>
        ALWAYS_PRIMARY.includes(p.name) ||
        (PRIMARY_PARAM_NAMES.includes(p.name) && p.enum && !ALWAYS_PRIMARY.includes(p.name))
      ),
    [paramSpecs]
  );

  // Advanced params: all specs that are not primary.
  const advancedParams = useMemo(() => {
    const primaryNames = new Set(primaryParams.map((p) => p.name));
    return paramSpecs.filter((p) => !primaryNames.has(p.name));
  }, [paramSpecs, primaryParams]);

  // Pixverse-specific credit estimate using pixverse-py pricing helper via backend.
  useEffectHook(() => {
    if (inferredProviderId !== 'pixverse') {
      setCreditEstimate(null);
      return;
    }

    const quality = (dynamicParams.quality as string) || '';
    const model = (dynamicParams.model as string) || '';

    // For videos we need a duration; for images we don't.
    const durationRaw = dynamicParams.duration;
    const duration = durationRaw !== undefined ? Number(durationRaw) : 0;

    const isVideo =
      operationType === 'text_to_video' ||
      operationType === 'image_to_video' ||
      operationType === 'video_extend' ||
      operationType === 'video_transition' ||
      operationType === 'fusion';

    const isImage =
      operationType === 'text_to_image' || operationType === 'image_to_image';

    // For images we require model + quality; for video we require duration + model.
    if (isVideo && (!duration || duration <= 0 || !model)) {
      setCreditEstimate(null);
      return;
    }
    if (isImage && (!quality || !model)) {
      setCreditEstimate(null);
      return;
    }

    const motion_mode = (dynamicParams.motion_mode as string | undefined) || undefined;
    const multi_shot = !!dynamicParams.multi_shot;
    const audio = !!dynamicParams.audio;

    let cancelled = false;
    setCreditEstimateLoading(true);
    estimatePixverseCost(
      isImage
        ? {
            kind: 'image',
            quality,
            duration: 1, // ignored for images
            model,
          }
        : {
            kind: 'video',
            quality,
            duration,
            model,
            motion_mode,
            multi_shot,
            audio,
          }
    )
      .then((res) => {
        if (!cancelled) {
          setCreditEstimate(res.estimated_credits ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCreditEstimate(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCreditEstimateLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    inferredProviderId,
    operationType,
    dynamicParams.duration,
    dynamicParams.quality,
    dynamicParams.model,
    dynamicParams.motion_mode,
    dynamicParams.multi_shot,
    dynamicParams.audio,
  ]);

  useEffectHook(() => {
    if (!durationOptions || durationOptions.options.length === 0) {
      return;
    }
    const currentValue = Number(dynamicParams.duration);
    if (!durationOptions.options.includes(currentValue)) {
      onChangeParam('duration', durationOptions.options[0]);
    }
  }, [durationOptions, dynamicParams.duration, onChangeParam]);

  function handleChange(name: string, value: any) {
    onChangeParam(name, value);
  }

  function handleProviderChange(newProviderId: string | undefined) {
    if (onChangeProvider) {
      onChangeProvider(newProviderId);
    } else {
      // Fallback: use __provider__ sentinel for backward compatibility
      onChangeParam('__provider__', newProviderId);
    }
  }

  return (
    <>
      {/* Settings bar - expands left horizontally */}
      {showSettings && (
        <div className="flex items-center gap-1 animate-in slide-in-from-right-2 duration-150">
          {/* Provider selector - inline */}
          <select
            value={providerId ?? ''}
            onChange={(e) => handleProviderChange(e.target.value || undefined)}
            disabled={generating}
            className="px-2 py-1 text-[11px] rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-0 disabled:opacity-50 cursor-pointer"
            title="Provider"
          >
            <option value="">Auto</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Primary params - shown directly as small controls */}
          {primaryParams.map((param) => {
            if (param.name === 'duration' && param.type === 'number') {
              if (durationOptions && durationOptions.options.length > 0) {
                const currentDuration = Number(dynamicParams[param.name]) || durationOptions.options[0];
                return (
                  <div key="duration-options" className="flex flex-col items-start gap-0.5">
                    <div className="flex gap-1">
                      {durationOptions.options.map((seconds) => (
                        <button
                          type="button"
                          key={seconds}
                          onClick={() => handleChange(param.name, seconds)}
                          disabled={generating}
                          className={clsx(
                            'px-1.5 py-0.5 rounded border text-[10px] transition-colors',
                            currentDuration === seconds
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-600 hover:border-blue-400 dark:hover:border-blue-400'
                          )}
                          title={`${seconds} seconds`}
                        >
                          {seconds}s
                        </button>
                      ))}
                    </div>
                      {operationType === 'video_transition' && (
                        <span className="text-[9px] text-neutral-500 dark:text-neutral-400">
                          Duration applies to each transition prompt (1-5s per segment)
                        </span>
                      )}
                    </div>
                  );
                }

              return (
                <input
                  key={param.name}
                  type="number"
                  value={dynamicParams[param.name] ?? param.default ?? ''}
                  onChange={(e) =>
                    handleChange(
                      param.name,
                      e.target.value ? Number(e.target.value) : ''
                    )
                  }
                  disabled={generating}
                  min={param.min}
                  max={param.max}
                  placeholder={param.default?.toString()}
                  className="px-1.5 py-1 text-[10px] rounded bg-white dark:bg-neutral-700 border-0 disabled:opacity-50 cursor-pointer max-w-[80px]"
                  title={param.name}
                />
              );
            }

            // Common aspect ratios fallback when no enum provided
            const COMMON_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
            const options = param.enum ?? (param.name === 'aspect_ratio' ? COMMON_ASPECT_RATIOS : null);

            return (
              <select
                key={param.name}
                value={dynamicParams[param.name] ?? param.default ?? ''}
                onChange={(e) => handleChange(param.name, e.target.value)}
                disabled={generating}
                className="px-2 py-1 text-[11px] rounded-lg bg-white dark:bg-neutral-900 shadow-sm border-0 disabled:opacity-50 cursor-pointer"
                title={param.name}
              >
                {options ? (
                  options.map((opt: string) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))
                ) : (
                  <option value={dynamicParams[param.name] ?? ''}>
                    {dynamicParams[param.name] ?? param.name}
                  </option>
                )}
              </select>
            );
          })}

          {/* Cost estimate - compact icon + number */}
          {inferredProviderId === 'pixverse' && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400" title="Estimated credits">
              {creditEstimateLoading ? (
                <span className="text-neutral-400">…</span>
              ) : creditEstimate !== null ? (
                <>
                  <span>◆</span>
                  <span>{creditEstimate.toFixed(1)}</span>
                </>
              ) : (operationType === 'text_to_video' ||
                  operationType === 'image_to_video' ||
                  operationType === 'video_extend' ||
                  operationType === 'video_transition' ||
                  operationType === 'fusion') &&
                  costHints?.per_second !== undefined &&
                  dynamicParams.duration ? (
                <>
                  <span>◆</span>
                  <span>{(Number(dynamicParams.duration || 0) * (costHints.per_second ?? 0)).toFixed(1)}</span>
                </>
              ) : null}
            </span>
          )}

          {/* Advanced params button - only if there are additional params */}
          {advancedParams.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setExpandedSetting(expandedSetting === 'advanced' ? null : 'advanced')}
                className={clsx(
                  'px-2 py-1 text-[10px] rounded transition-colors',
                  expandedSetting === 'advanced'
                    ? 'bg-white dark:bg-neutral-700 shadow-sm'
                    : 'hover:bg-white/50 dark:hover:bg-neutral-700/50'
                )}
              >
                +{advancedParams.length}
              </button>
              {expandedSetting === 'advanced' && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg p-2 min-w-[180px] max-h-[250px] overflow-y-auto space-y-2">
                  {advancedParams.map((param) => (
                    <div key={param.name} className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-500 min-w-[60px]">
                        {param.name.replace(/_/g, ' ')}
                      </span>
                      {param.enum ? (
                        <select
                          value={dynamicParams[param.name] ?? param.default ?? ''}
                          onChange={(e) => handleChange(param.name, e.target.value)}
                          disabled={generating}
                          className="flex-1 p-1 text-[10px] border rounded bg-white dark:bg-neutral-800 disabled:opacity-50"
                        >
                          <option value="">-</option>
                          {param.enum.map((opt: string) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : param.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={!!dynamicParams[param.name]}
                          onChange={(e) => handleChange(param.name, e.target.checked)}
                          disabled={generating}
                          className="w-3 h-3"
                        />
                      ) : (
                        <input
                          type={param.type === 'number' ? 'number' : 'text'}
                          value={dynamicParams[param.name] ?? ''}
                          onChange={(e) =>
                            handleChange(
                              param.name,
                              param.type === 'number' ? Number(e.target.value) : e.target.value
                            )
                          }
                          disabled={generating}
                          placeholder={param.default?.toString()}
                          className="flex-1 p-1 text-[10px] border rounded bg-white dark:bg-neutral-800 disabled:opacity-50 w-16"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preset indicator */}
          {presetId && (
            <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
              {presetId}
            </span>
          )}
        </div>
      )}

      {/* Settings toggle */}
      <button
        onClick={() => {
          onToggleSettings();
          setExpandedSetting(null);
        }}
        className={clsx(
          'text-sm transition-opacity',
          showSettings
            ? 'opacity-100'
            : 'opacity-50 hover:opacity-80'
        )}
        title="Generation settings"
      >
        ⚙
      </button>
    </>
  );
}
