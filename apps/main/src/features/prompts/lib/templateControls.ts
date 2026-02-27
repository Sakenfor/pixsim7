import type { TemplateSlot } from '@lib/api/blockTemplates';

export type TemplateControlEffect =
  | {
      kind: 'slot_intensity';
      slotLabel: string;
      /** Optional stable target; preferred over label matching. */
      slotKey?: string;
    }
  | {
      kind: 'slot_tag_boost';
      slotLabel: string;
      /** Optional stable target; preferred over label matching. */
      slotKey?: string;
      enabledAt?: number;
      boostTags?: Record<string, string | string[]>;
      avoidTags?: Record<string, string | string[]>;
    };

export interface TemplateSliderControl {
  id: string;
  type: 'slider';
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  effects: TemplateControlEffect[];
}

export interface TemplateSelectControlOption {
  id: string;
  label: string;
  effects: TemplateControlEffect[];
}

export interface TemplateSelectControl {
  id: string;
  type: 'select';
  label: string;
  defaultValue: string | null;
  options: TemplateSelectControlOption[];
}

export type TemplateControl = TemplateSliderControl | TemplateSelectControl;

const DEFAULT_SLIDER_CONTROL: TemplateSliderControl = {
  id: 'control',
  type: 'slider',
  label: 'Control',
  min: 0,
  max: 10,
  step: 1,
  defaultValue: 5,
  effects: [],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeTagMap(value: unknown): Record<string, string | string[]> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const entries = Object.entries(record)
    .map(([key, raw]) => {
      const normalizedKey = key.trim();
      if (!normalizedKey) return null;
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return null;
        return [normalizedKey, trimmed] as const;
      }
      if (Array.isArray(raw)) {
        const arr = raw
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean);
        if (arr.length === 0) return null;
        return [normalizedKey, Array.from(new Set(arr))] as const;
      }
      return null;
    })
    .filter((entry): entry is readonly [string, string | string[]] => !!entry);

  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function normalizeControlEffects(
  rawEffects: unknown,
  opts?: { min?: number; max?: number },
): TemplateControlEffect[] {
  const orderedMin = opts?.min ?? 0;
  const orderedMax = opts?.max ?? 10;
  const effects = Array.isArray(rawEffects) ? rawEffects : [];
  return effects
    .map((effect) => {
      const e = asRecord(effect);
      if (!e) return null;
      if (e.kind === 'slot_intensity') {
        const slotLabel = typeof e.slotLabel === 'string' ? e.slotLabel.trim() : '';
        if (!slotLabel) return null;
        const slotKey = typeof e.slotKey === 'string' ? e.slotKey.trim() : '';
        return { kind: 'slot_intensity' as const, slotLabel, ...(slotKey ? { slotKey } : {}) };
      }
      if (e.kind === 'slot_tag_boost') {
        const slotLabel = typeof e.slotLabel === 'string' ? e.slotLabel.trim() : '';
        if (!slotLabel) return null;
        const boostTags = normalizeTagMap(e.boostTags);
        const avoidTags = normalizeTagMap(e.avoidTags);
        if (!boostTags && !avoidTags) return null;
        const slotKey = typeof e.slotKey === 'string' ? e.slotKey.trim() : '';
        const enabledAtRaw = e.enabledAt == null ? undefined : toFiniteNumber(e.enabledAt, 1);
        const enabledAt = enabledAtRaw == null ? undefined : clamp(enabledAtRaw, orderedMin, orderedMax);
        return {
          kind: 'slot_tag_boost' as const,
          slotLabel,
          ...(slotKey ? { slotKey } : {}),
          ...(enabledAt != null ? { enabledAt } : {}),
          ...(boostTags ? { boostTags } : {}),
          ...(avoidTags ? { avoidTags } : {}),
        };
      }
      return null;
    })
    .filter((e): e is TemplateControlEffect => !!e);
}

function normalizeSliderControl(raw: unknown, index: number): TemplateSliderControl | null {
  const record = asRecord(raw);
  if (!record) return null;

  const type = record.type === 'slider' ? 'slider' : null;
  if (!type) return null;

  const label =
    typeof record.label === 'string' && record.label.trim()
      ? record.label.trim()
      : `Control ${index + 1}`;

  const id =
    typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `control_${index + 1}`;

  const min = toFiniteNumber(record.min, DEFAULT_SLIDER_CONTROL.min);
  const max = toFiniteNumber(record.max, DEFAULT_SLIDER_CONTROL.max);
  const orderedMin = Math.min(min, max);
  const orderedMax = Math.max(min, max);
  const step = Math.max(0.01, toFiniteNumber(record.step, DEFAULT_SLIDER_CONTROL.step));
  const defaultValue = clamp(
    toFiniteNumber(record.defaultValue, DEFAULT_SLIDER_CONTROL.defaultValue),
    orderedMin,
    orderedMax,
  );

  const effects = normalizeControlEffects(record.effects, { min: orderedMin, max: orderedMax });

  return {
    id,
    type,
    label,
    min: orderedMin,
    max: orderedMax,
    step,
    defaultValue,
    effects,
  };
}

function normalizeSelectControl(raw: unknown, index: number): TemplateSelectControl | null {
  const record = asRecord(raw);
  if (!record || record.type !== 'select') return null;

  const label =
    typeof record.label === 'string' && record.label.trim()
      ? record.label.trim()
      : `Select ${index + 1}`;

  const id =
    typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `select_${index + 1}`;

  const rawOptions = Array.isArray(record.options) ? record.options : [];
  const options: TemplateSelectControlOption[] = rawOptions
    .map((rawOption, optionIndex) => {
      const option = asRecord(rawOption);
      if (!option) return null;
      const optionId = typeof option.id === 'string' ? option.id.trim() : '';
      if (!optionId) return null;
      const optionLabel =
        typeof option.label === 'string' && option.label.trim()
          ? option.label.trim()
          : `Option ${optionIndex + 1}`;
      return {
        id: optionId,
        label: optionLabel,
        effects: normalizeControlEffects(option.effects),
      };
    })
    .filter((option): option is TemplateSelectControlOption => !!option);

  const rawDefault = typeof record.defaultValue === 'string' ? record.defaultValue.trim() : '';
  const defaultValue = rawDefault || options[0]?.id || null;

  return {
    id,
    type: 'select',
    label,
    defaultValue,
    options,
  };
}

export function readTemplateControls(templateMetadata: unknown): TemplateControl[] {
  const meta = asRecord(templateMetadata);
  const rawControls = meta && Array.isArray(meta.controls) ? meta.controls : [];
  return rawControls
    .map((raw, index) => normalizeSliderControl(raw, index) ?? normalizeSelectControl(raw, index))
    .filter((control): control is TemplateControl => !!control);
}

export function createTemplateSliderControl(seed?: Partial<TemplateSliderControl>): TemplateSliderControl {
  const next: TemplateSliderControl = {
    ...DEFAULT_SLIDER_CONTROL,
    ...seed,
    type: 'slider',
    effects: seed?.effects ? [...seed.effects] : [],
  };
  next.min = Number.isFinite(next.min) ? next.min : DEFAULT_SLIDER_CONTROL.min;
  next.max = Number.isFinite(next.max) ? next.max : DEFAULT_SLIDER_CONTROL.max;
  if (next.max < next.min) {
    const tmp = next.min;
    next.min = next.max;
    next.max = tmp;
  }
  next.step = Math.max(0.01, Number.isFinite(next.step) ? next.step : DEFAULT_SLIDER_CONTROL.step);
  next.defaultValue = clamp(
    Number.isFinite(next.defaultValue) ? next.defaultValue : DEFAULT_SLIDER_CONTROL.defaultValue,
    next.min,
    next.max,
  );
  next.id = (next.id || '').trim() || DEFAULT_SLIDER_CONTROL.id;
  next.label = (next.label || '').trim() || DEFAULT_SLIDER_CONTROL.label;
  return next;
}

/**
 * Apply slider control defaults to matching slots (pure function).
 * Returns the updated slots array, or `null` if nothing changed.
 */
export function applyControlDefaultsToSlots(
  controls: TemplateControl[],
  slots: TemplateSlot[],
): { slots: TemplateSlot[]; affected: number } | null {
  if (controls.length === 0 || slots.length === 0) return null;

  let changed = false;
  let affected = 0;
  const nextSlots = slots.map((slot) => {
    let nextSlot = slot;
    let slotChanged = false;
      for (const control of controls) {
        if (control.type !== 'slider') continue;
        for (const effect of control.effects) {
          const slotKey = typeof slot.key === 'string' ? slot.key.trim() : '';
          const effectKey = 'slotKey' in effect && typeof effect.slotKey === 'string' ? effect.slotKey.trim() : '';
          if (effectKey) {
            if (!slotKey || slotKey !== effectKey) continue;
          } else {
            if (!slot.label || slot.label !== effect.slotLabel) continue;
          }

        if (effect.kind === 'slot_intensity') {
          if ((nextSlot.inherit_intensity ?? false) || nextSlot.intensity !== control.defaultValue) {
            nextSlot = { ...nextSlot, inherit_intensity: false, intensity: control.defaultValue };
            changed = true;
            slotChanged = true;
          }
          continue;
        }

        if (effect.kind === 'slot_tag_boost') {
          const enabledAt = effect.enabledAt ?? control.min;
          if (control.defaultValue < enabledAt) continue;

          const currentPreferences =
            nextSlot.preferences && typeof nextSlot.preferences === 'object' && !Array.isArray(nextSlot.preferences)
              ? (nextSlot.preferences as Record<string, unknown>)
              : {};
          const nextPreferences: Record<string, unknown> = { ...currentPreferences };

          if (effect.boostTags && Object.keys(effect.boostTags).length > 0) {
            const currentBoost =
              currentPreferences.boost_tags && typeof currentPreferences.boost_tags === 'object' && !Array.isArray(currentPreferences.boost_tags)
                ? (currentPreferences.boost_tags as Record<string, unknown>)
                : {};
            nextPreferences.boost_tags = { ...currentBoost, ...effect.boostTags };
          }

          if (effect.avoidTags && Object.keys(effect.avoidTags).length > 0) {
            const currentAvoid =
              currentPreferences.avoid_tags && typeof currentPreferences.avoid_tags === 'object' && !Array.isArray(currentPreferences.avoid_tags)
                ? (currentPreferences.avoid_tags as Record<string, unknown>)
                : {};
            nextPreferences.avoid_tags = { ...currentAvoid, ...effect.avoidTags };
          }

          const before = JSON.stringify(nextSlot.preferences ?? null);
          const after = JSON.stringify(nextPreferences);
          if (before !== after) {
            nextSlot = { ...nextSlot, preferences: nextPreferences as any };
            changed = true;
            slotChanged = true;
          }
        }
      }
    }
    if (slotChanged) affected++;
    return nextSlot;
  });

  return changed ? { slots: nextSlots, affected } : null;
}
