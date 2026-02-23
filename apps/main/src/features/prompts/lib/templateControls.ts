export type TemplateControlEffect =
  | {
      kind: 'slot_intensity';
      slotLabel: string;
    }
  | {
      kind: 'slot_tag_boost';
      slotLabel: string;
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

export type TemplateControl = TemplateSliderControl;

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

  const rawEffects = Array.isArray(record.effects) ? record.effects : [];
  const effects: TemplateControlEffect[] = rawEffects
    .map((effect) => {
      const e = asRecord(effect);
      if (!e) return null;
      if (e.kind === 'slot_intensity') {
        const slotLabel = typeof e.slotLabel === 'string' ? e.slotLabel.trim() : '';
        if (!slotLabel) return null;
        return { kind: 'slot_intensity' as const, slotLabel };
      }
      if (e.kind === 'slot_tag_boost') {
        const slotLabel = typeof e.slotLabel === 'string' ? e.slotLabel.trim() : '';
        if (!slotLabel) return null;
        const boostTags = normalizeTagMap(e.boostTags);
        const avoidTags = normalizeTagMap(e.avoidTags);
        if (!boostTags && !avoidTags) return null;
        const enabledAtRaw = e.enabledAt == null ? undefined : toFiniteNumber(e.enabledAt, 1);
        const enabledAt = enabledAtRaw == null ? undefined : clamp(enabledAtRaw, orderedMin, orderedMax);
        return {
          kind: 'slot_tag_boost' as const,
          slotLabel,
          ...(enabledAt != null ? { enabledAt } : {}),
          ...(boostTags ? { boostTags } : {}),
          ...(avoidTags ? { avoidTags } : {}),
        };
      }
      return null;
    })
    .filter((e): e is TemplateControlEffect => !!e);

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

export function readTemplateControls(templateMetadata: unknown): TemplateControl[] {
  const meta = asRecord(templateMetadata);
  const rawControls = meta && Array.isArray(meta.controls) ? meta.controls : [];
  return rawControls
    .map((raw, index) => normalizeSliderControl(raw, index))
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
