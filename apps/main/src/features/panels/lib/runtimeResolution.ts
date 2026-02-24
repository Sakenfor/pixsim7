export interface RuntimeSourceCandidate<TSource extends string, TValue> {
  source: TSource;
  enabled: boolean;
  value: TValue;
}

/**
 * Pick the first enabled runtime source based on explicit priority.
 * Keeps source precedence declarative instead of embedding branch ladders in hooks.
 */
export function resolveRuntimeSource<TSource extends string, TValue>(
  candidates: readonly RuntimeSourceCandidate<TSource, TValue>[],
  priority: readonly TSource[],
): RuntimeSourceCandidate<TSource, TValue> | undefined {
  const bySource = new Map<TSource, RuntimeSourceCandidate<TSource, TValue>>();
  for (const candidate of candidates) {
    bySource.set(candidate.source, candidate);
  }
  for (const source of priority) {
    const candidate = bySource.get(source);
    if (candidate?.enabled) {
      return candidate;
    }
  }
  return undefined;
}

