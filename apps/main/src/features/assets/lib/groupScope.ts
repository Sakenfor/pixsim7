export type GroupScopeOption = { value: string; label: string };

const FALLBACK_SCOPE_OPTIONS: GroupScopeOption[] = [
  { value: 'pixverse_sync', label: 'Pixverse Sync' },
  { value: 'web', label: 'Web Import' },
  { value: 'local', label: 'Local' },
  { value: 'generated', label: 'Generated' },
  { value: 'video_capture', label: 'Video Capture' },
];

export function normalizeGroupScopeSelection(value: unknown): string[] {
  if (value == null) return [];
  const rawValues = Array.isArray(value) ? value : [value];
  const flattened = rawValues.flatMap((entry) => {
    if (typeof entry === 'string') {
      return entry.split(',');
    }
    return [String(entry)];
  });
  const cleaned = flattened
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry.toLowerCase() !== 'all');
  return Array.from(new Set(cleaned));
}

export function resolveGroupScopeOptions(
  dynamicOptions?: Array<{ value: string; label?: string | null }> | null,
): GroupScopeOption[] {
  const normalized = (dynamicOptions || [])
    .map((option) => ({
      value: String(option.value),
      label: option.label ?? String(option.value),
    }))
    .filter((option) => option.value && option.value.toLowerCase() !== 'all');

  if (normalized.length > 0) {
    return normalized;
  }

  return FALLBACK_SCOPE_OPTIONS;
}

export function buildGroupScopeLabel(
  selection: string[],
  options: GroupScopeOption[],
): string {
  if (selection.length === 0) return 'All assets';
  const labelMap = new Map(options.map((option) => [option.value, option.label]));
  if (selection.length === 1) {
    return labelMap.get(selection[0]) ?? selection[0];
  }
  if (selection.length <= 3) {
    return selection.map((value) => labelMap.get(value) ?? value).join(', ');
  }
  return `${selection.length} scopes`;
}
