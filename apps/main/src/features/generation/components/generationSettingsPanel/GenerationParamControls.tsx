import clsx from 'clsx';
import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';

import {
  COMMON_ASPECT_RATIOS,
  getAspectRatioLabel,
  getDurationOptions,
  getModelFamilies,
  getParamIcon,
  getQualityOptions,
  isVisualParam,
  ModelBadge,
  type ParamSpec,
} from '@lib/generation-ui';
import { Icon } from '@lib/icons';

import { AspectRatioDropdown } from './AspectRatioDropdown';
import { DurationRotaryPicker } from './DurationRotaryPicker';
import { ModelDropdown } from './ModelDropdown';

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

function isModelInPromotionSet(promotedModels: Set<string>, value: unknown): boolean {
  return getModelMatchKeys(value).some((key) => promotedModels.has(key));
}

interface BindingDecoration {
  /** True when this param is bound to the current input (shows the indigo ring). */
  isBound: boolean;
  /** clsx fragment for the indigo bound-ring ('' when not bound). */
  ring: string;
  /** Tooltip suffix describing the bind/unbind affordance ('' when binding off). */
  hint: string;
  /** Spread onto a control root: middle-click toggles the binding; the mousedown
   *  guard suppresses the browser's middle-click autoscroll. */
  auxProps: {
    onAuxClick: (e: ReactMouseEvent) => void;
    onMouseDown: (e: ReactMouseEvent) => void;
  } | Record<string, never>;
}

/**
 * Single source of truth for per-input binding decoration (the prompt pin,
 * generalized). Used by every param branch AND the nested boolean toggles
 * (audio, api_method) so the middle-click + indigo-ring logic isn't copy-pasted
 * per control. Probe-amber lives in the branches; the parent strips bound keys
 * from probeOverrides so the two never compete. Plan: per-input-param-override.
 */
function getBindingDecoration(
  name: string,
  boundParams: Record<string, unknown> | null,
  bindingEnabled: boolean,
  onToggleParamBinding?: (name: string) => void,
): BindingDecoration {
  const isBound =
    !!bindingEnabled && !!boundParams &&
    Object.prototype.hasOwnProperty.call(boundParams, name);
  const ring = isBound ? 'ring-2 ring-indigo-400 dark:ring-indigo-500' : '';
  const hint = bindingEnabled
    ? (isBound
        ? ' · bound to this asset (middle-click to unbind)'
        : ' · middle-click to bind to this asset')
    : '';
  const auxProps = (bindingEnabled && onToggleParamBinding)
    ? {
        onAuxClick: (e: ReactMouseEvent) => {
          if (e.button !== 1) return;
          e.preventDefault();
          onToggleParamBinding(name);
        },
        onMouseDown: (e: ReactMouseEvent) => {
          if (e.button === 1) e.preventDefault();
        },
      }
    : {};
  return { isBound, ring, hint, auxProps };
}

interface GenerationParamControlsProps {
  paramSpecs: ParamSpec[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  generating?: boolean;
  unlimitedModels?: Set<string>;
  promotedModels?: Set<string>;
  showApiMethodToggle?: boolean;
  /** Map of param name → value that probe-mode will override at submit time.
   *  Only entries whose value differs from the current `values[name]` should
   *  be present (the panel pre-filters). Renders a small inline indicator
   *  next to the relevant control so the user sees the swap without losing
   *  their normal-mode setting. */
  probeOverrides?: Record<string, unknown> | null;
  /** Current input's per-input param bindings (`paramOverrides`). Bound params
   *  get an indigo ring + tooltip; `values` should already reflect the bound
   *  value for WYSIWYG display. The prompt pin, generalized to any param.
   *  Plan: per-input-param-override. */
  boundParams?: Record<string, unknown> | null;
  /** Middle-click a control to bind/un-bind that param to the current input.
   *  No-op when undefined (no current input). */
  onToggleParamBinding?: (name: string) => void;
  /** Whether per-input binding is currently available (a current input exists). */
  bindingEnabled?: boolean;
}

export function GenerationParamControls({
  paramSpecs,
  values,
  onChange,
  generating = false,
  unlimitedModels = new Set<string>(),
  promotedModels = new Set<string>(),
  showApiMethodToggle = false,
  probeOverrides = null,
  boundParams = null,
  onToggleParamBinding,
  bindingEnabled = false,
}: GenerationParamControlsProps) {
  const durationOptions = useMemo(
    () => getDurationOptions(paramSpecs, values?.model)?.options ?? null,
    [paramSpecs, values?.model],
  );

  const qualityOptionsForModel = useMemo(
    () => getQualityOptions(paramSpecs, values?.model),
    [paramSpecs, values?.model],
  );

  const modelFamilies = useMemo(
    () => getModelFamilies(paramSpecs),
    [paramSpecs],
  );

  useEffect(() => {
    if (!qualityOptionsForModel) return;
    const currentQuality = values?.quality;
    if (currentQuality && !qualityOptionsForModel.includes(currentQuality)) {
      onChange('quality', qualityOptionsForModel[0]);
    } else if (!currentQuality && qualityOptionsForModel.length > 0) {
      onChange('quality', qualityOptionsForModel[0]);
    }
  }, [qualityOptionsForModel, values?.quality, onChange]);

  useEffect(() => {
    if (!durationOptions || durationOptions.length === 0) return;
    const rawDuration = values?.duration;
    if (rawDuration === undefined || rawDuration === null || rawDuration === '') return;
    const currentDuration = Number(rawDuration);
    if (!Number.isFinite(currentDuration)) return;
    if (durationOptions.includes(currentDuration)) return;

    const minDuration = durationOptions[0];
    const maxDuration = durationOptions[durationOptions.length - 1];
    const nextDuration = currentDuration < minDuration
      ? minDuration
      : currentDuration > maxDuration
        ? maxDuration
        : minDuration;

    if (nextDuration !== currentDuration) {
      onChange('duration', nextDuration);
    }
  }, [durationOptions, values?.duration, onChange]);

  // Wheel handler for duration stepper — registered with { passive: false }
  // so preventDefault() works (React onWheel is passive by default).
  // Handler lives in a ref so the listener is attached once and never re-registered.
  const durationWheelHandlerRef = useRef<(e: WheelEvent) => void>();
  durationWheelHandlerRef.current = (e: WheelEvent) => {
    if (generating || !durationOptions) return;
    e.preventDefault();
    const currentDuration = Number(values?.duration) || durationOptions[0];
    const currentIdx = durationOptions.indexOf(currentDuration);
    const next = e.deltaY < 0
      ? Math.min(currentIdx + 1, durationOptions.length - 1)
      : Math.max(currentIdx - 1, 0);
    if (next !== currentIdx) onChange('duration', durationOptions[next]);
  };
  const durationWheelElRef = useRef<HTMLDivElement | null>(null);
  const durationWheelListenerRef = useRef<((e: WheelEvent) => void) | null>(null);
  const durationWheelCallbackRef = (el: HTMLDivElement | null) => {
    // Detach from previous element
    if (durationWheelElRef.current && durationWheelListenerRef.current) {
      durationWheelElRef.current.removeEventListener('wheel', durationWheelListenerRef.current);
    }
    durationWheelElRef.current = el;
    if (el) {
      const handler = (e: WheelEvent) => durationWheelHandlerRef.current?.(e);
      durationWheelListenerRef.current = handler;
      el.addEventListener('wheel', handler, { passive: false });
    }
  };

  const renderParam = (param: ParamSpec) => {
        if (param.type === 'boolean') return null;
        if (param.type === 'string' && !param.enum) return null;

        // Hide params restricted to specific models
        const appliesToModels = param.metadata?.applies_to_models as string[] | undefined;
        if (appliesToModels && appliesToModels.length > 0) {
          const currentModel = typeof values?.model === 'string' ? values.model : '';
          if (currentModel && !appliesToModels.includes(currentModel)) return null;
        }

        // Probe override (non-duration): yellow ring on the existing control
        // signals "probe will swap this value at submit time" without changing
        // the displayed value or interactivity. Computed once per param so all
        // branches below can apply the same accent.
        const probeOverrideValue = param.name === 'duration'
          ? undefined  // duration handles its own ring inline
          : probeOverrides?.[param.name];
        const isProbeOverridden = probeOverrideValue !== undefined;
        const probeOverrideTooltip = isProbeOverridden
          ? (() => {
              const raw = String(probeOverrideValue ?? '—');
              const display = param.name === 'aspect_ratio' ? getAspectRatioLabel(raw) : raw;
              return `Probe override — ${param.name} will run as ${display}.`;
            })()
          : undefined;

        // Per-input binding (prompt pin, generalized). The parent strips bound
        // keys from probeOverrides, so amber (probe) and indigo (bound) never
        // compete on the same control. Plan: per-input-param-override.
        const { isBound, ring: bindRing, hint: bindHint, auxProps } =
          getBindingDecoration(param.name, boundParams, bindingEnabled, onToggleParamBinding);

        if (param.name === 'duration' && param.type === 'number' && durationOptions) {
          const currentDuration = Number(values[param.name]) || durationOptions[0];
          // Audio toggle: find the audio boolean param and check if applicable to current model
          const audioParam = paramSpecs.find((p) => p.name === 'audio' && p.type === 'boolean');
          const audioAppliesTo: string[] | undefined = audioParam?.metadata?.applies_to_models;
          const currentModelStr = typeof values?.model === 'string' ? values.model : '';
          const showAudio = !!audioParam && (!audioAppliesTo || audioAppliesTo.includes(currentModelStr));
          const audioOn = !!values?.audio;
          const apiMethodOn = values?.api_method === 'openapi';
          return (
            <div key="duration" className="flex items-center gap-1">
              {showApiMethodToggle && (
                <button
                  type="button"
                  onClick={() => onChange('api_method', apiMethodOn ? undefined : 'openapi')}
                  disabled={generating}
                  className={clsx(
                    'flex items-center justify-center rounded-lg px-1.5 py-1.5 transition-colors',
                    apiMethodOn
                      ? 'bg-accent text-accent-text shadow-sm'
                      : 'bg-white dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300',
                    generating && 'opacity-50 cursor-not-allowed',
                  )}
                  title={apiMethodOn ? 'Route via OpenAPI (click to use WebAPI)' : 'Route via WebAPI (click to force OpenAPI)'}
                >
                  <Icon name="key" size={14} />
                </button>
              )}
              <div
                ref={durationWheelCallbackRef}
                {...auxProps}
                className={clsx(
                  'flex items-center flex-shrink-0 rounded-lg bg-white dark:bg-neutral-800 shadow-sm',
                  probeOverrides?.duration !== undefined && 'ring-2 ring-amber-400 dark:ring-amber-500',
                  bindRing,
                )}
                title={(probeOverrides?.duration !== undefined
                  ? `Probe override — runs at ${String(probeOverrides.duration)}s instead of your saved ${currentDuration}s.`
                  : 'Duration — scroll to adjust') + bindHint}
              >
                <span className="flex items-center justify-center pl-1.5 pr-0 py-1.5 text-neutral-400 dark:text-neutral-500" aria-hidden="true">
                  <Icon name="clock" size={12} />
                </span>
                <DurationRotaryPicker
                  options={durationOptions}
                  value={currentDuration}
                  onChange={(next) => onChange('duration', next)}
                  disabled={generating}
                />
              </div>
              {showAudio && (() => {
                const probeAudioOverride = probeOverrides?.audio;
                const isProbeAudioOverridden = probeAudioOverride !== undefined;
                // 'audio' is a boolean sub-control of the duration row, not its own
                // renderParam branch — so it pulls binding decoration for its own
                // key via the shared helper. Plan: per-input-param-override.
                const { isBound: audioBound, hint: audioBindHint, auxProps: audioAux } =
                  getBindingDecoration('audio', boundParams, bindingEnabled, onToggleParamBinding);
                return (
                  <button
                    type="button"
                    {...audioAux}
                    onClick={() => onChange('audio', !audioOn)}
                    disabled={generating}
                    className={clsx(
                      'flex items-center justify-center rounded-lg px-1.5 py-1.5 transition-colors',
                      audioOn
                        ? 'bg-accent text-accent-text shadow-sm'
                        : 'bg-white dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300',
                      isProbeAudioOverridden && 'ring-2 ring-amber-400 dark:ring-amber-500',
                      audioBound && 'ring-2 ring-indigo-400 dark:ring-indigo-500',
                      generating && 'opacity-50 cursor-not-allowed',
                    )}
                    title={(isProbeAudioOverridden
                      ? `Probe override — audio will be ${probeAudioOverride ? 'on' : 'off'} (your saved value: ${audioOn ? 'on' : 'off'}).`
                      : audioOn ? 'Audio generation on' : 'Audio generation off') + audioBindHint}
                  >
                    <Icon name="audio" size={14} />
                  </button>
                );
              })()}
            </div>
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
              {...auxProps}
              value={values[param.name] ?? param.default ?? ''}
              onChange={(e) => onChange(param.name, e.target.value === '' ? undefined : Number(e.target.value))}
              disabled={generating}
              placeholder={param.name}
              className={clsx(
                'w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm',
                isProbeOverridden && 'ring-2 ring-amber-400 dark:ring-amber-500',
                bindRing,
              )}
              title={(probeOverrideTooltip ?? param.name) + bindHint}
            />
          );
        }

        if (!options) return null;

        const showAsVisualGrid = isVisualParam(param.name);
        const currentValue = values[param.name] ?? param.default ?? options[0];

        if (param.name === 'aspect_ratio') {
          const inner = (
            <AspectRatioDropdown
              options={options}
              currentValue={currentValue}
              onChange={(val) => onChange(param.name, val)}
              disabled={generating}
            />
          );
          if (isProbeOverridden || isBound) {
            return (
              <div
                key={param.name}
                {...auxProps}
                className={clsx(
                  'flex-shrink-0 rounded-lg',
                  isProbeOverridden && 'ring-2 ring-amber-400 dark:ring-amber-500',
                  bindRing,
                )}
                title={isProbeOverridden ? probeOverrideTooltip : `aspect_ratio${bindHint}`}
              >
                {inner}
              </div>
            );
          }
          return <div key={param.name} {...auxProps}>{inner}</div>;
        }

        const isIconOnly = param.name === 'quality';
        const gridLimit = isIconOnly ? 14 : 8;
        if (showAsVisualGrid && options.length <= gridLimit) {
          return (
            <div
              key={param.name}
              {...auxProps}
              className={clsx('gen-param-full flex flex-wrap gap-1', isBound && 'rounded-lg', bindRing)}
              title={bindHint ? `${param.name}${bindHint}` : undefined}
            >
              {options.map((opt: string) => {
                const icon = getParamIcon(param.name, opt);
                const isSelected = currentValue === opt;
                const isFreeModel = param.name === 'model' && isModelInUnlimitedSet(unlimitedModels, opt);
                const isPromoModel = param.name === 'model' && isModelInPromotionSet(promotedModels, opt);
                const isProbeTarget = isProbeOverridden && String(probeOverrideValue) === opt;

                return (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => onChange(param.name, opt)}
                    disabled={generating}
                    className={clsx(
                      'rounded-lg text-[11px] font-medium transition-colors duration-200',
                      'flex items-center',
                      isIconOnly ? 'px-1.5 py-1 justify-center' : 'px-2 py-1 gap-1.5',
                      isSelected
                        ? (isFreeModel
                            ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-300/60'
                            : isPromoModel
                              ? 'bg-accent text-accent-text shadow-sm ring-1 ring-amber-300/60'
                              : 'bg-accent text-accent-text shadow-sm')
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 hover:bg-accent-subtle dark:hover:bg-neutral-700',
                      isProbeTarget && 'ring-2 ring-amber-400 dark:ring-amber-500',
                    )}
                    title={isProbeTarget
                      ? `Probe override — will run with ${opt} instead of your selected ${String(currentValue)}.`
                      : isFreeModel ? `${opt} (currently free)` : isPromoModel ? `${opt} (promotional discount)` : opt}
                  >
                    {icon}
                    {!isIconOnly && param.name === 'model' && modelFamilies?.[opt] && (
                      <ModelBadge family={modelFamilies[opt]} size={14} />
                    )}
                    {!isIconOnly && <span>{opt}</span>}
                    {isFreeModel && (
                      <span
                        className={clsx(
                          'px-1 py-px rounded text-[8px] font-bold leading-none uppercase tracking-[0.03em]',
                          isSelected
                            ? 'bg-white/20 text-emerald-50'
                            : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        free
                      </span>
                    )}
                    {isPromoModel && !isFreeModel && (
                      <span
                        className={clsx(
                          'px-1 py-px rounded text-[8px] font-bold leading-none uppercase tracking-[0.03em]',
                          isSelected
                            ? 'bg-white/20 text-amber-50'
                            : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
                        )}
                      >
                        sale
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        }

        // Model param: use rich dropdown with model badges
        if (param.name === 'model') {
          const inner = (
            <ModelDropdown
              options={options}
              currentValue={currentValue}
              onChange={(val) => onChange(param.name, val)}
              disabled={generating}
              modelFamilies={modelFamilies}
              unlimitedModels={unlimitedModels}
              promotedModels={promotedModels}
            />
          );
          if (isProbeOverridden || isBound) {
            return (
              <div
                key={param.name}
                {...auxProps}
                className={clsx(
                  'rounded-lg',
                  isProbeOverridden && 'ring-2 ring-amber-400 dark:ring-amber-500',
                  bindRing,
                )}
                title={isProbeOverridden ? probeOverrideTooltip : `model${bindHint}`}
              >
                {inner}
              </div>
            );
          }
          return <div key={param.name} {...auxProps}>{inner}</div>;
        }

        return (
          <select
            key={param.name}
            {...auxProps}
            value={currentValue}
            onChange={(e) => onChange(param.name, e.target.value)}
            disabled={generating}
            className={clsx(
              'w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm',
              isProbeOverridden && 'ring-2 ring-amber-400 dark:ring-amber-500',
              bindRing,
            )}
            title={(probeOverrideTooltip ?? param.name) + bindHint}
          >
            {options.map((opt: string) => {
              const baseLabel = param.name === 'aspect_ratio' ? getAspectRatioLabel(opt) : opt;
              return (
                <option key={opt} value={opt}>
                  {baseLabel}
                </option>
              );
            })}
          </select>
        );
  };

  // Pair orientation (aspect_ratio) + size (quality) into one row so they sit
  // side by side instead of stacking / the size grid spanning full width.
  const rendered = new Set<string>();
  return (
    <>
      {paramSpecs.map((param) => {
        if (rendered.has(param.name)) return null;
        if (param.name === 'aspect_ratio' || param.name === 'quality') {
          rendered.add('aspect_ratio');
          rendered.add('quality');
          const orientation = paramSpecs.find((p) => p.name === 'aspect_ratio');
          const size = paramSpecs.find((p) => p.name === 'quality');
          const orientationEl = orientation ? renderParam(orientation) : null;
          const sizeEl = size ? renderParam(size) : null;
          if (!orientationEl && !sizeEl) return null;
          return (
            <div key="orientation-size" className="gen-param-full flex flex-wrap items-center gap-1">
              {orientationEl}
              {sizeEl}
            </div>
          );
        }
        return renderParam(param);
      })}
    </>
  );
}
