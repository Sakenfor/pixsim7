import clsx from 'clsx';
import { useEffect, useMemo } from 'react';

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

interface GenerationParamControlsProps {
  paramSpecs: ParamSpec[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  generating?: boolean;
  unlimitedModels?: Set<string>;
  promotedModels?: Set<string>;
}

export function GenerationParamControls({
  paramSpecs,
  values,
  onChange,
  generating = false,
  unlimitedModels = new Set<string>(),
  promotedModels = new Set<string>(),
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

  return (
    <>
      {paramSpecs.map((param) => {
        if (param.type === 'boolean') return null;
        if (param.type === 'string' && !param.enum) return null;

        if (param.name === 'duration' && param.type === 'number' && durationOptions) {
          const currentDuration = Number(values[param.name]) || durationOptions[0];
          // Audio toggle: find the audio boolean param and check if applicable to current model
          const audioParam = paramSpecs.find((p) => p.name === 'audio' && p.type === 'boolean');
          const audioAppliesTo: string[] | undefined = audioParam?.metadata?.applies_to_models;
          const currentModelStr = typeof values?.model === 'string' ? values.model : '';
          const showAudio = !!audioParam && (!audioAppliesTo || audioAppliesTo.includes(currentModelStr));
          const audioOn = !!values?.audio;
          return (
            <div key="duration" className="flex items-center gap-1">
              <select
                value={currentDuration}
                onChange={(e) => onChange('duration', Number(e.target.value))}
                disabled={generating}
                className="flex-1 min-w-0 px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
                title="Duration"
              >
                {durationOptions.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds}s
                  </option>
                ))}
              </select>
              {showAudio && (
                <button
                  type="button"
                  onClick={() => onChange('audio', !audioOn)}
                  disabled={generating}
                  className={clsx(
                    'flex items-center justify-center rounded-lg px-1.5 py-1.5 transition-colors',
                    audioOn
                      ? 'bg-accent text-accent-text shadow-sm'
                      : 'bg-white dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300',
                    generating && 'opacity-50 cursor-not-allowed',
                  )}
                  title={audioOn ? 'Audio generation on' : 'Audio generation off'}
                >
                  <Icon name="audio" size={14} />
                </button>
              )}
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
              value={values[param.name] ?? param.default ?? ''}
              onChange={(e) => onChange(param.name, e.target.value === '' ? undefined : Number(e.target.value))}
              disabled={generating}
              placeholder={param.name}
              className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
              title={param.name}
            />
          );
        }

        if (!options) return null;

        const showAsVisualGrid = isVisualParam(param.name);
        const currentValue = values[param.name] ?? param.default ?? options[0];

        if (param.name === 'aspect_ratio') {
          return (
            <AspectRatioDropdown
              key={param.name}
              options={options}
              currentValue={currentValue}
              onChange={(val) => onChange(param.name, val)}
              disabled={generating}
            />
          );
        }

        const isIconOnly = param.name === 'quality';
        const gridLimit = isIconOnly ? 14 : 8;
        if (showAsVisualGrid && options.length <= gridLimit) {
          return (
            <div key={param.name} className="gen-param-full flex flex-wrap gap-1">
              {options.map((opt: string) => {
                const icon = getParamIcon(param.name, opt);
                const isSelected = currentValue === opt;
                const isFreeModel = param.name === 'model' && isModelInUnlimitedSet(unlimitedModels, opt);
                const isPromoModel = param.name === 'model' && isModelInPromotionSet(promotedModels, opt);

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
                    )}
                    title={isFreeModel ? `${opt} (currently free)` : isPromoModel ? `${opt} (promotional discount)` : opt}
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
          return (
            <ModelDropdown
              key={param.name}
              options={options}
              currentValue={currentValue}
              onChange={(val) => onChange(param.name, val)}
              disabled={generating}
              modelFamilies={modelFamilies}
              unlimitedModels={unlimitedModels}
              promotedModels={promotedModels}
            />
          );
        }

        return (
          <select
            key={param.name}
            value={currentValue}
            onChange={(e) => onChange(param.name, e.target.value)}
            disabled={generating}
            className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border-0 shadow-sm"
            title={param.name}
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
      })}
    </>
  );
}
