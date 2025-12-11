/**
 * HUD Layout Switcher
 *
 * Part of Task 58 Phase 58.4 - Presets, Profiles & Overrides
 *
 * Quick switcher to temporarily override HUD layout for testing without changing defaults.
 */

import { useState, useEffect } from 'react';
import { useHudLayoutStore } from '../stores/hudLayoutStore';
import type { WorldHudLayout } from '@/lib/hud/types';

export interface HudLayoutSwitcherProps {
  worldId: number | string;
  currentLayoutId: string | null;
  onLayoutChange: (layoutId: string | null) => void;
}

export function HudLayoutSwitcher({
  worldId,
  currentLayoutId,
  onLayoutChange,
}: HudLayoutSwitcherProps) {
  const store = useHudLayoutStore();
  const [layouts, setLayouts] = useState<WorldHudLayout[]>([]);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; icon: string }>>([]);

  useEffect(() => {
    const worldLayouts = store.getLayoutsForWorld(worldId);
    setLayouts(worldLayouts);

    const allPresets = store.getAllPresets();
    setPresets(allPresets.map(p => ({ id: p.id, name: p.name, icon: p.icon })));
  }, [worldId, store]);

  const handleApplyPreset = (presetId: string) => {
    const newLayout = store.applyPreset(worldId, presetId);
    if (newLayout) {
      onLayoutChange(newLayout.id);
    }
  };

  const handleReset = () => {
    const defaultLayout = store.getDefaultLayoutForWorld(worldId);
    onLayoutChange(defaultLayout?.id || null);
  };

  const defaultLayoutId = store.getDefaultLayoutForWorld(worldId)?.id;
  const isOverridden = currentLayoutId !== defaultLayoutId && currentLayoutId !== null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
        HUD:
      </label>

      <select
        value={currentLayoutId || ''}
        onChange={(e) => onLayoutChange(e.target.value || null)}
        className="px-2 py-1 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded"
      >
        <option value="">Default</option>
        {layouts.map((layout) => (
          <option key={layout.id} value={layout.id}>
            {layout.name} {layout.isDefault ? '★' : ''}
          </option>
        ))}
      </select>

      {presets.length > 0 && (
        <div className="relative group">
          <button
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            title="Apply preset"
          >
            Presets ▾
          </button>
          <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset.id)}
                className="w-full text-left px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                {preset.icon} {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {isOverridden && (
        <button
          onClick={handleReset}
          className="px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
          title="Reset to default HUD"
        >
          Reset
        </button>
      )}
    </div>
  );
}
