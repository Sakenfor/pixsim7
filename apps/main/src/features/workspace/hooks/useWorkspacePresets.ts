import { useMemo } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { PresetScope, LayoutPreset } from '../stores/workspaceStore';

/**
 * Hook to get filtered presets for a specific scope with proper memoization.
 *
 * This hook solves the infinite loop issue by:
 * 1. Selecting the raw presets array from the store (stable reference)
 * 2. Using useMemo to filter only when the underlying data changes
 *
 * @param scope - The preset scope to filter by
 * @returns Filtered array of presets for the given scope
 */
export function useWorkspacePresets(scope: PresetScope): LayoutPreset[] {
  const allPresets = useWorkspaceStore((s) => s.presets);

  return useMemo(
    () => allPresets.filter((p) => p.scope === scope || p.scope === 'all'),
    [allPresets, scope]
  );
}
