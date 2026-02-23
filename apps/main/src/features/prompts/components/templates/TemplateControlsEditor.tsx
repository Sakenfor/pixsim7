import clsx from 'clsx';

import { Icon } from '@lib/icons';
import { DisclosureSection } from '@pixsim7/shared.ui';

import {
  createTemplateSliderControl,
  type TemplateControl,
  type TemplateControlEffect,
  type TemplateSliderControl,
} from '../../lib/templateControls';

interface TemplateControlsEditorProps {
  controls: TemplateControl[];
  availableSlotLabels: string[];
  onChange: (controls: TemplateControl[]) => void;
  disabled?: boolean;
}

interface ControlUiWarning {
  id: string;
  message: string;
}

function normalizeId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');
}

function getTagBoostEffects(control: TemplateSliderControl) {
  return control.effects.filter((e): e is Extract<TemplateControlEffect, { kind: 'slot_tag_boost' }> => e.kind === 'slot_tag_boost');
}

function getSlotIntensityEffects(control: TemplateSliderControl) {
  return control.effects.filter((e): e is Extract<TemplateControlEffect, { kind: 'slot_intensity' }> => e.kind === 'slot_intensity');
}

interface TagMapRow {
  id: string;
  key: string;
  valuesText: string;
}

function mapToRows(map?: Record<string, string | string[]>): TagMapRow[] {
  if (!map) return [];
  return Object.entries(map).map(([key, value], index) => ({
    id: `${key}-${index}`,
    key,
    valuesText: Array.isArray(value) ? value.join(', ') : value,
  }));
}

function rowsToMap(rows: TagMapRow[]): Record<string, string | string[]> | undefined {
  const entries = rows
    .map((row) => {
      const key = row.key.trim();
      if (!key) return null;
      const values = row.valuesText
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      if (values.length === 0) return null;
      return [key, values.length === 1 ? values[0] : Array.from(new Set(values))] as const;
    })
    .filter((entry): entry is readonly [string, string | string[]] => !!entry);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function TagMapRowsEditor({
  label,
  description,
  value,
  placeholderKey,
  placeholderValues,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  value?: Record<string, string | string[]>;
  placeholderKey: string;
  placeholderValues: string;
  disabled: boolean;
  onChange: (next: Record<string, string | string[]> | undefined) => void;
}) {
  const rows = mapToRows(value);

  const setRows = (nextRows: TagMapRow[]) => {
    onChange(rowsToMap(nextRows));
  };

  return (
    <div className="space-y-1">
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{label}</div>
      {description && (
        <div className="text-[10px] text-neutral-400 dark:text-neutral-500">{description}</div>
      )}
      <div className="space-y-1">
        {rows.map((row, rowIndex) => (
          <div key={row.id} className="grid grid-cols-[1fr_1.4fr_auto] gap-1">
            <input
              type="text"
              value={row.key}
              onChange={(e) => {
                const key = e.target.value;
                setRows(rows.map((r, i) => (i === rowIndex ? { ...r, key } : r)));
              }}
              disabled={disabled}
              placeholder={placeholderKey}
              className="w-full text-[11px] font-mono px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 outline-none"
            />
            <input
              type="text"
              value={row.valuesText}
              onChange={(e) => {
                const valuesText = e.target.value;
                setRows(rows.map((r, i) => (i === rowIndex ? { ...r, valuesText } : r)));
              }}
              disabled={disabled}
              placeholder={placeholderValues}
              className="w-full text-[11px] px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 outline-none"
            />
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, i) => i !== rowIndex))}
              disabled={disabled}
              className="px-2 text-neutral-400 hover:text-red-500 disabled:opacity-50"
              title={`Remove ${label.toLowerCase()} row`}
            >
              <Icon name="x" size={11} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows([
          ...rows,
          { id: `row-${Date.now()}-${rows.length}`, key: '', valuesText: '' },
        ])}
        disabled={disabled}
        className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
      >
        <Icon name="plus" size={8} className="inline mr-1" />
        Add row
      </button>
    </div>
  );
}

function setTagBoostEffectField(
  controls: TemplateControl[],
  controlIndex: number,
  effectIndex: number,
  patch: Partial<Extract<TemplateControlEffect, { kind: 'slot_tag_boost' }>>,
) {
  return replaceControlEffects(controls, controlIndex, (effects) =>
    effects.map((item, i) => i === effectIndex && item.kind === 'slot_tag_boost'
      ? { ...item, ...patch }
      : item),
  );
}

function clearTagBoostEffectField(
  controls: TemplateControl[],
  controlIndex: number,
  effectIndex: number,
  field: 'boostTags' | 'avoidTags',
) {
  return replaceControlEffects(controls, controlIndex, (effects) =>
    effects.map((item, i) => {
      if (i !== effectIndex || item.kind !== 'slot_tag_boost') return item;
      const next = { ...item } as any;
      delete next[field];
      return next;
    }),
  );
}

function updateTagBoostEffectMap(
  controls: TemplateControl[],
  controlIndex: number,
  effectIndex: number,
  field: 'boostTags' | 'avoidTags',
  value: Record<string, string | string[]> | undefined,
) {
  return value
    ? setTagBoostEffectField(controls, controlIndex, effectIndex, { [field]: value } as any)
    : clearTagBoostEffectField(controls, controlIndex, effectIndex, field);
}

function setControlIndex(
  controls: TemplateControl[],
  index: number,
  updater: (control: TemplateSliderControl) => TemplateSliderControl,
) {
  return controls.map((control, i) => {
    if (i !== index || control.type !== 'slider') return control;
    return createTemplateSliderControl(updater(control));
  });
}

function replaceControlEffects(
  controls: TemplateControl[],
  index: number,
  updater: (effects: TemplateControlEffect[]) => TemplateControlEffect[],
) {
  return setControlIndex(controls, index, (control) => ({
    ...control,
    effects: updater(control.effects),
  }));
}

function setSlotIntensityTargets(
  controls: TemplateControl[],
  index: number,
  slotLabels: string[],
) {
  const normalized = Array.from(new Set(slotLabels.map((v) => v.trim()).filter(Boolean)));
  return replaceControlEffects(controls, index, (effects) => {
    const nonIntensity = effects.filter((e) => e.kind !== 'slot_intensity');
    const intensityEffects = normalized.map((slotLabel) => ({ kind: 'slot_intensity' as const, slotLabel }));
    return [...intensityEffects, ...nonIntensity];
  });
}

export function TemplateControlsEditor({
  controls,
  availableSlotLabels,
  onChange,
  disabled = false,
}: TemplateControlsEditorProps) {
  const addControl = (seed?: Partial<TemplateSliderControl>) => {
    onChange([
      ...controls,
      createTemplateSliderControl({
        id: `control_${controls.length + 1}`,
        label: `Control ${controls.length + 1}`,
        ...seed,
      }),
    ]);
  };

  const addPoseLockStarter = () => {
    const poseDefaults = createTemplateSliderControl({
      id: 'pose_lock',
      label: 'Pose Lock',
      min: 0,
      max: 10,
      step: 1,
      defaultValue: 6,
      effects: [
        { kind: 'slot_intensity', slotLabel: 'pose_lock_reinforce' },
        {
          kind: 'slot_tag_boost',
          slotLabel: 'pose_lock_reinforce',
          enabledAt: 4,
          boostTags: { pose_lock: 'high' },
          avoidTags: { pose_drift: ['high', 'extreme'] },
        },
      ],
    });

    const hasExisting = controls.some((c) => c.id === poseDefaults.id);
    if (hasExisting) {
      let suffix = 2;
      while (controls.some((c) => c.id === `pose_lock_${suffix}`)) suffix += 1;
      poseDefaults.id = `pose_lock_${suffix}`;
      poseDefaults.label = `Pose Lock ${suffix}`;
    }

    onChange([...controls, poseDefaults]);
  };

  const previewSlotLabelSuggestions = availableSlotLabels.length > 0
    ? availableSlotLabels.join(', ')
    : 'Add labeled slots to target them from controls';
  const availableSlotLabelSet = new Set(availableSlotLabels);
  const controlIdCounts = controls.reduce<Record<string, number>>((acc, control) => {
    const id = (control.id || '').trim();
    if (!id) return acc;
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-neutral-600 dark:text-neutral-300 flex items-center gap-1">
            <Icon name="sliders" size={12} />
            Template Controls ({controls.length})
          </div>
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
            Declarative controls stored in template metadata (e.g. Pose Lock slider).
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={addPoseLockStarter}
            disabled={disabled}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            title="Add a starter slider control linked to a pose_lock_reinforce slot label"
          >
            <Icon name="sparkles" size={10} className="inline mr-1" />
            Add Pose Lock
          </button>
          <button
            type="button"
            onClick={() => addControl()}
            disabled={disabled}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            <Icon name="plus" size={10} className="inline mr-1" />
            Add slider
          </button>
        </div>
      </div>

      {controls.length === 0 && (
        <div className="text-xs text-neutral-400 dark:text-neutral-500 text-center py-3 rounded border border-dashed border-neutral-200 dark:border-neutral-700">
          No template controls yet. Add a slider to make template behavior self-definable.
        </div>
      )}

      {controls.map((control, index) => {
        if (control.type !== 'slider') return null;

        const slider = control;
        const slotIntensityEffects = getSlotIntensityEffects(slider);
        const slotIntensityTargets = slotIntensityEffects.map((e) => e.slotLabel);
        const tagBoostEffects = getTagBoostEffects(slider);
        const missingIntensityTargets = slotIntensityTargets.filter((label) => !availableSlotLabelSet.has(label));
        const missingTagBoostTargets = tagBoostEffects.filter((effect) => !availableSlotLabelSet.has(effect.slotLabel));
        const activeTagBoostEffectsAtDefault = tagBoostEffects.filter((effect) => slider.defaultValue >= (effect.enabledAt ?? slider.min));
        const hasAnyEffects = slider.effects.length > 0;
        const warnings: ControlUiWarning[] = [];
        if (!slider.id.trim()) {
          warnings.push({ id: 'missing-id', message: 'Control ID is empty.' });
        } else if ((controlIdCounts[slider.id.trim()] ?? 0) > 1) {
          warnings.push({ id: 'duplicate-id', message: 'Duplicate control ID.' });
        }
        if (!hasAnyEffects) {
          warnings.push({ id: 'no-effects', message: 'No effects configured (slider currently does nothing).' });
        }
        if (missingIntensityTargets.length > 0) {
          warnings.push({
            id: 'missing-intensity-targets',
            message: `${missingIntensityTargets.length} intensity target${missingIntensityTargets.length === 1 ? '' : 's'} missing slot labels.`,
          });
        }
        if (missingTagBoostTargets.length > 0) {
          warnings.push({
            id: 'missing-tag-targets',
            message: `${missingTagBoostTargets.length} tag-boost effect${missingTagBoostTargets.length === 1 ? '' : 's'} target missing slot labels.`,
          });
        }
        if (tagBoostEffects.length > 0 && activeTagBoostEffectsAtDefault.length === 0) {
          warnings.push({
            id: 'thresholds-inactive',
            message: 'Current default value does not activate any tag-boost effects.',
          });
        }

        return (
          <SliderControlCard
            key={`${control.id}-${index}`}
            slider={slider}
            index={index}
            controls={controls}
            warnings={warnings}
            slotIntensityTargets={slotIntensityTargets}
            tagBoostEffects={tagBoostEffects}
            activeTagBoostEffectsAtDefault={activeTagBoostEffectsAtDefault}
            availableSlotLabels={availableSlotLabels}
            availableSlotLabelSet={availableSlotLabelSet}
            previewSlotLabelSuggestions={previewSlotLabelSuggestions}
            disabled={disabled}
            onChange={onChange}
          />
        );
      })}
    </div>
  );
}

function SliderControlCard({
  slider,
  index,
  controls,
  warnings,
  slotIntensityTargets,
  tagBoostEffects,
  activeTagBoostEffectsAtDefault,
  availableSlotLabels,
  availableSlotLabelSet,
  previewSlotLabelSuggestions,
  disabled,
  onChange,
}: {
  slider: TemplateSliderControl;
  index: number;
  controls: TemplateControl[];
  warnings: ControlUiWarning[];
  slotIntensityTargets: string[];
  tagBoostEffects: Extract<TemplateControlEffect, { kind: 'slot_tag_boost' }>[];
  activeTagBoostEffectsAtDefault: Extract<TemplateControlEffect, { kind: 'slot_tag_boost' }>[];
  availableSlotLabels: string[];
  availableSlotLabelSet: Set<string>;
  previewSlotLabelSuggestions: string;
  disabled: boolean;
  onChange: (controls: TemplateControl[]) => void;
}) {
  const sliderLabel = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] font-semibold truncate">{slider.label || 'Slider Control'}</span>
      <span className="text-[10px] font-mono text-neutral-400 shrink-0">{slider.id}</span>
      <span className="flex flex-wrap items-center gap-1 ml-auto">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
          {tagBoostEffects.length} boost
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
          {slotIntensityTargets.length} int
        </span>
        {warnings.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
            {warnings.length}!
          </span>
        )}
      </span>
    </span>
  );

  return (
    <DisclosureSection
      label={sliderLabel}
      className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-800/40 p-2"
      actions={
        <button
          type="button"
          onClick={() => onChange(controls.filter((_, i) => i !== index))}
          disabled={disabled}
          className="text-neutral-400 hover:text-red-500 disabled:opacity-50 shrink-0"
          title="Remove control"
        >
          <Icon name="x" size={12} />
        </button>
      }
    >
      <div className="space-y-2 mt-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
            {slotIntensityTargets.length} intensity target{slotIntensityTargets.length === 1 ? '' : 's'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
            {tagBoostEffects.length} tag-boost effect{tagBoostEffects.length === 1 ? '' : 's'}
          </span>
          {tagBoostEffects.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300">
              {activeTagBoostEffectsAtDefault.length}/{tagBoostEffects.length} active at default
            </span>
          )}
          {warnings.length === 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300">
              Valid
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">
              {warnings.length} warning{warnings.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/10 p-2 space-y-1">
            {warnings.map((warning) => (
              <div key={warning.id} className="text-[10px] text-amber-700 dark:text-amber-300 flex items-start gap-1">
                <Icon name="alertCircle" size={10} className="mt-[1px] shrink-0" />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-0.5">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Label</span>
            <input
              type="text"
              value={slider.label}
              onChange={(e) => {
                const label = e.target.value;
                onChange(setControlIndex(controls, index, (c) => ({
                  ...c,
                  label,
                  id: c.id === '' || c.id === 'control'
                    ? normalizeId(label) || c.id
                    : c.id,
                })));
              }}
              disabled={disabled}
              placeholder="Pose Lock"
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 outline-none"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">ID</span>
            <input
              type="text"
              value={slider.id}
              onChange={(e) => {
                const nextId = normalizeId(e.target.value);
                onChange(setControlIndex(controls, index, (c) => ({ ...c, id: nextId })));
              }}
              disabled={disabled}
              placeholder="pose_lock"
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 outline-none font-mono"
            />
          </label>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <label className="space-y-0.5">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Min</span>
            <input
              type="number"
              value={slider.min}
              onChange={(e) => {
                const min = Number(e.target.value);
                onChange(setControlIndex(controls, index, (c) => ({ ...c, min })));
              }}
              disabled={disabled}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 outline-none"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Max</span>
            <input
              type="number"
              value={slider.max}
              onChange={(e) => {
                const max = Number(e.target.value);
                onChange(setControlIndex(controls, index, (c) => ({ ...c, max })));
              }}
              disabled={disabled}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 outline-none"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Step</span>
            <input
              type="number"
              value={slider.step}
              onChange={(e) => {
                const step = Number(e.target.value);
                onChange(setControlIndex(controls, index, (c) => ({ ...c, step })));
              }}
              disabled={disabled}
              min={0.01}
              step={0.01}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 outline-none"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Default</span>
            <input
              type="number"
              value={slider.defaultValue}
              onChange={(e) => {
                const defaultValue = Number(e.target.value);
                onChange(setControlIndex(controls, index, (c) => ({ ...c, defaultValue })));
              }}
              disabled={disabled}
              step={slider.step}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 outline-none"
            />
          </label>
        </div>

        <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                <Icon name="link" size={9} />
                Slot intensity targets
              </span>
              <button
                type="button"
                onClick={() => onChange(setSlotIntensityTargets(
                  controls,
                  index,
                  [...slotIntensityTargets, availableSlotLabels[0] || 'pose_lock_reinforce'],
                ))}
                disabled={disabled}
                className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                <Icon name="plus" size={8} className="inline mr-1" />
                Add target
              </button>
            </div>
            {slotIntensityTargets.length === 0 && (
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                No slot intensity targets yet.
              </div>
            )}
            <div className="space-y-1">
              {slotIntensityTargets.map((slotLabel, targetIndex) => (
                <div key={`${slotLabel}-${targetIndex}`} className="grid grid-cols-[1fr_auto] gap-1">
                  <div className="grid grid-cols-[1fr_auto] gap-1">
                    <input
                      type="text"
                      value={slotLabel}
                      onChange={(e) => {
                        const nextTargets = slotIntensityTargets.map((v, i) => i === targetIndex ? e.target.value : v);
                        onChange(setSlotIntensityTargets(controls, index, nextTargets));
                      }}
                      disabled={disabled}
                      placeholder="pose_lock_reinforce"
                      list={`slot-labels-${index}-${targetIndex}`}
                      className={clsx(
                        'w-full text-xs px-2 py-1 rounded border bg-white dark:bg-neutral-900 outline-none font-mono',
                        availableSlotLabelSet.has(slotLabel)
                          ? 'border-neutral-200 dark:border-neutral-700'
                          : 'border-amber-300 dark:border-amber-700'
                      )}
                    />
                    <datalist id={`slot-labels-${index}-${targetIndex}`}>
                      {availableSlotLabels.map((label) => (
                        <option key={label} value={label} />
                      ))}
                    </datalist>
                    <span
                      className={clsx(
                        'text-[10px] px-1.5 py-1 rounded border',
                        availableSlotLabelSet.has(slotLabel)
                          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300'
                      )}
                      title={availableSlotLabelSet.has(slotLabel) ? 'Matched slot label' : 'No slot with this label currently exists'}
                    >
                      {availableSlotLabelSet.has(slotLabel) ? 'matched' : 'missing'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextTargets = slotIntensityTargets.filter((_, i) => i !== targetIndex);
                      onChange(setSlotIntensityTargets(controls, index, nextTargets));
                    }}
                    disabled={disabled}
                    className="px-2 text-neutral-400 hover:text-red-500 disabled:opacity-50"
                    title="Remove slot target"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
              Known slot labels: {previewSlotLabelSuggestions}
            </div>
          </div>

          <div className="mt-3 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/30 p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                <Icon name="sparkles" size={9} />
                Tag boost effects (selection preferences)
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange(replaceControlEffects(controls, index, (effects) => ([
                    ...effects,
                    {
                      kind: 'slot_tag_boost',
                      slotLabel: availableSlotLabels[0] || 'pose_lock_reinforce',
                      enabledAt: slider.min,
                      boostTags: { pose_lock: 'high' },
                    },
                  ])));
                }}
                disabled={disabled}
                className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                <Icon name="plus" size={8} className="inline mr-1" />
                Add tag boost
              </button>
            </div>

            {tagBoostEffects.length === 0 && (
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                Optional: use slider thresholds to apply slot preference tag boosts/avoids.
              </div>
            )}

            {tagBoostEffects.map((effect, effectIndex) => {
              const globalEffectIndex = slider.effects.findIndex((e) => e.kind === 'slot_tag_boost' && e === effect);
              return (
                <TagBoostEffectCard
                  key={`${effect.slotLabel}-${effectIndex}`}
                  effect={effect}
                  effectIndex={effectIndex}
                  globalEffectIndex={globalEffectIndex}
                  slider={slider}
                  index={index}
                  controls={controls}
                  availableSlotLabels={availableSlotLabels}
                  availableSlotLabelSet={availableSlotLabelSet}
                  disabled={disabled}
                  onChange={onChange}
                />
              );
            })}
          </div>

          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Default slider
              </span>
              <span className="text-[10px] font-mono text-neutral-600 dark:text-neutral-300">
                {slider.defaultValue}
              </span>
            </div>
            <input
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={slider.defaultValue}
              onChange={(e) => {
                const defaultValue = Number(e.target.value);
                onChange(setControlIndex(controls, index, (c) => ({ ...c, defaultValue })));
              }}
              disabled={disabled}
              className={clsx('w-full h-1 accent-blue-500', disabled && 'opacity-60')}
            />
          </div>
        </div>
      </div>
    </DisclosureSection>
  );
}

function TagBoostEffectCard({
  effect,
  effectIndex,
  globalEffectIndex,
  slider,
  index,
  controls,
  availableSlotLabels,
  availableSlotLabelSet,
  disabled,
  onChange,
}: {
  effect: Extract<TemplateControlEffect, { kind: 'slot_tag_boost' }>;
  effectIndex: number;
  globalEffectIndex: number;
  slider: TemplateSliderControl;
  index: number;
  controls: TemplateControl[];
  availableSlotLabels: string[];
  availableSlotLabelSet: Set<string>;
  disabled: boolean;
  onChange: (controls: TemplateControl[]) => void;
}) {
  const boostCount = Object.keys(effect.boostTags ?? {}).length;
  const avoidCount = Object.keys(effect.avoidTags ?? {}).length;
  const isActive = slider.defaultValue >= (effect.enabledAt ?? slider.min);
  const isMatched = availableSlotLabelSet.has(effect.slotLabel);

  const effectLabel = (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="text-[11px] font-mono truncate">{effect.slotLabel || 'untitled'}</span>
      <span className="text-[10px] text-neutral-400 shrink-0">@{effect.enabledAt ?? slider.min}</span>
      <span className="flex items-center gap-1 ml-auto">
        {boostCount > 0 && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300">
            +{boostCount}
          </span>
        )}
        {avoidCount > 0 && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300">
            -{avoidCount}
          </span>
        )}
        {!isMatched && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300">
            missing
          </span>
        )}
        {!isActive && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300">
            off
          </span>
        )}
      </span>
    </span>
  );

  return (
    <DisclosureSection
      label={effectLabel}
      className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 overflow-hidden"
      headerClassName="px-2 py-1.5"
      contentClassName="px-2 pb-2 border-t border-neutral-100 dark:border-neutral-700/60 pt-2"
      actions={
        <button
          type="button"
          onClick={() => {
            onChange(replaceControlEffects(controls, index, (effects) =>
              effects.filter((_, i) => i !== globalEffectIndex),
            ));
          }}
          disabled={disabled}
          className="text-neutral-400 hover:text-red-500 disabled:opacity-50 shrink-0"
          title="Remove tag boost effect"
        >
          <Icon name="x" size={11} />
        </button>
      }
    >
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <label className="space-y-0.5">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Slot label</span>
            <input
              type="text"
              value={effect.slotLabel}
              onChange={(e) => {
                const slotLabel = e.target.value.trim();
                onChange(replaceControlEffects(controls, index, (effects) =>
                  effects.map((item, i) => i === globalEffectIndex && item.kind === 'slot_tag_boost'
                    ? { ...item, slotLabel }
                    : item),
                ));
              }}
              list={`tag-boost-slot-labels-${index}-${effectIndex}`}
              disabled={disabled}
              className={clsx(
                'w-full text-xs px-2 py-1 rounded border bg-white dark:bg-neutral-900 outline-none font-mono',
                isMatched
                  ? 'border-neutral-200 dark:border-neutral-700'
                  : 'border-amber-300 dark:border-amber-700'
              )}
            />
            <datalist id={`tag-boost-slot-labels-${index}-${effectIndex}`}>
              {availableSlotLabels.map((label) => <option key={label} value={label} />)}
            </datalist>
          </label>
          <label className="space-y-0.5">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Enabled at</span>
            <input
              type="number"
              value={effect.enabledAt ?? slider.min}
              min={slider.min}
              max={slider.max}
              step={slider.step}
              onChange={(e) => {
                const enabledAt = Number(e.target.value);
                onChange(replaceControlEffects(controls, index, (effects) =>
                  effects.map((item, i) => i === globalEffectIndex && item.kind === 'slot_tag_boost'
                    ? { ...item, enabledAt }
                    : item),
                ));
              }}
              disabled={disabled}
              className="w-20 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <TagMapRowsEditor
            label="Boost tags"
            description="Tag key + value(s). Multiple values: comma-separated."
            value={effect.boostTags}
            placeholderKey="pose_lock"
            placeholderValues="high"
            disabled={disabled}
            onChange={(next) => onChange(updateTagBoostEffectMap(
              controls,
              index,
              globalEffectIndex,
              'boostTags',
              next,
            ))}
          />
          <TagMapRowsEditor
            label="Avoid tags"
            description="Optional negative preferences for the same slot."
            value={effect.avoidTags}
            placeholderKey="pose_drift"
            placeholderValues="high, extreme"
            disabled={disabled}
            onChange={(next) => onChange(updateTagBoostEffectMap(
              controls,
              index,
              globalEffectIndex,
              'avoidTags',
              next,
            ))}
          />
        </div>
      </div>
    </DisclosureSection>
  );
}
