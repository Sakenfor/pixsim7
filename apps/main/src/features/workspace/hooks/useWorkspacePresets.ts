import { useMemo } from 'react';

import { getBuiltinLayoutPresetsForScope } from '../lib/builtinPresets';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { PresetScope, LayoutPreset } from '../stores/workspaceStore';

/**
 * Hook to get filtered presets for a specific scope with proper memoization.
 *
 * Returns built-in presets first, followed by user-saved presets.
 *
 * @param scope - The preset scope to filter by
 * @returns Merged array of built-in + user presets for the given scope
 */
export function useWorkspacePresets(scope: PresetScope): LayoutPreset[] {
  const userPresets = useWorkspaceStore((s) => s.presets);

  return useMemo(() => {
    const builtins = getBuiltinLayoutPresetsForScope(scope);
    const filtered = userPresets.filter((p) => p.scope === scope || p.scope === 'all');
    return [...builtins, ...filtered];
  }, [userPresets, scope]);
}
