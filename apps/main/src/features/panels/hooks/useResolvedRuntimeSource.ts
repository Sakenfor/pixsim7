import { useMemo } from "react";

import {
  resolveRuntimeSource,
  type RuntimeSourceCandidate,
} from "../lib/runtimeResolution";

/**
 * React wrapper around `resolveRuntimeSource` for stable, declarative source selection.
 */
export function useResolvedRuntimeSource<TSource extends string, TValue>(
  candidates: readonly RuntimeSourceCandidate<TSource, TValue>[],
  priority: readonly TSource[],
  fallbackValue: TValue,
): TValue {
  return useMemo(
    () => resolveRuntimeSource(candidates, priority)?.value ?? fallbackValue,
    [candidates, priority, fallbackValue],
  );
}

