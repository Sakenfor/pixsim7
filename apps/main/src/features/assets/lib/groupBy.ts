import type { GalleryGroupBy } from '@features/panels';

export const GROUP_BY_VALUES: GalleryGroupBy[] = ['source', 'generation', 'prompt', 'sibling'];
export const GROUP_BY_UI_VALUES: GalleryGroupBy[] = ['source', 'prompt', 'sibling'];

export const GROUP_BY_LABELS: Record<GalleryGroupBy, string> = {
  none: 'None',
  source: 'Source asset',
  generation: 'Generation',
  prompt: 'Prompt',
  sibling: 'Sibling',
};

export function normalizeGroupBySelection(value: unknown): GalleryGroupBy[] {
  if (value == null) return [];
  const rawValues = Array.isArray(value) ? value : [value];
  const flattened = rawValues.flatMap((entry) => {
    if (typeof entry === 'string') {
      return entry.split(',');
    }
    return [entry];
  });
  const normalized: GalleryGroupBy[] = [];
  for (const entry of flattened) {
    if (entry == null) continue;
    const raw = String(entry).trim();
    if (!raw || raw === 'none') continue;
    const candidate = raw as GalleryGroupBy;
    if (!GROUP_BY_VALUES.includes(candidate)) continue;
    if (!normalized.includes(candidate)) {
      normalized.push(candidate);
    }
  }
  return normalized;
}
