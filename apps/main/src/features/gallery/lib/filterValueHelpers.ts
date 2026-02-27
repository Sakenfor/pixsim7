import type { ClientFilterValue } from './useClientFilters';

/** Coerce a raw filter value (string, string[], or unknown) into a normalized string array. */
export function toMultiFilterValue(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const next = value
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    return next.length > 0 ? next : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : undefined;
  }
  return undefined;
}

/** Convert a ClientFilterValue (typically string[]) back to the shape expected by domain filters. */
export function fromMultiFilterValue(value: ClientFilterValue): string | string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.length === 1 ? value[0] : value;
}

/** Remove duplicate option entries by value, preserving first occurrence order. */
export function dedupeOptions(
  options: Array<{ value: string; label: string; count?: number }>,
): Array<{ value: string; label: string; count?: number }> {
  const seen = new Set<string>();
  const deduped: Array<{ value: string; label: string; count?: number }> = [];
  for (const option of options) {
    if (!option.value || seen.has(option.value)) continue;
    seen.add(option.value);
    deduped.push(option);
  }
  return deduped;
}
