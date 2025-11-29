/**
 * HUD Layout Manager
 *
 * Part of Task 58 Phase 58.2 - HUD Builder Panel
 *
 * Manage HUD layouts: select, create, delete, apply presets
 */

import { useHudLayoutStore } from '@/stores/hudLayoutStore';

export interface HudLayoutManagerProps {
  worldId: number | string;
  selectedLayoutId: string | null;
  onLayoutSelect: (layoutId: string) => void;
  onNewLayout: () => void;
}

export function HudLayoutManager({
  worldId,
  selectedLayoutId,
  onLayoutSelect,
  onNewLayout,
}: HudLayoutManagerProps) {
  const store = useHudLayoutStore();
  const layouts = store.getLayoutsForWorld(worldId);
  const presets = store.getAllPresets();

  const handleDeleteLayout = () => {
    if (!selectedLayoutId) return;
    if (confirm('Are you sure you want to delete this HUD layout?')) {
      store.deleteLayout(selectedLayoutId);
      const remainingLayouts = store.getLayoutsForWorld(worldId);
      if (remainingLayouts.length > 0) {
        onLayoutSelect(remainingLayouts[0].id);
      } else {
        onNewLayout();
      }
    }
  };

  const handleApplyPreset = (presetId: string) => {
    const newLayout = store.applyPreset(worldId, presetId);
    if (newLayout) {
      onLayoutSelect(newLayout.id);
    }
  };

  const handleSetDefault = () => {
    if (!selectedLayoutId) return;
    store.setDefaultLayout(worldId, selectedLayoutId);
  };

  const currentLayout = selectedLayoutId ? store.getLayout(selectedLayoutId) : null;

  return (
    <div className="flex items-center gap-3">
      {/* Layout Selector */}
      <select
        value={selectedLayoutId || ''}
        onChange={(e) => onLayoutSelect(e.target.value)}
        className="flex-1 px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded text-sm text-neutral-900 dark:text-neutral-100"
      >
        {layouts.map((layout) => (
          <option key={layout.id} value={layout.id}>
            {layout.name} {layout.isDefault ? '(Default)' : ''}
          </option>
        ))}
      </select>

      {/* Actions */}
      <button
        onClick={onNewLayout}
        className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        title="Create new HUD layout"
      >
        New
      </button>

      {/* Preset Dropdown */}
      <div className="relative group">
        <button
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          title="Apply preset"
        >
          Presets ▾
        </button>
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
          {presets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleApplyPreset(preset.id)}
              className="w-full text-left px-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              <div className="font-medium">{preset.icon} {preset.name}</div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* More Actions */}
      {currentLayout && (
        <>
          {!currentLayout.isDefault && (
            <button
              onClick={handleSetDefault}
              className="px-3 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded text-sm hover:bg-neutral-300 dark:hover:bg-neutral-600"
              title="Set as default for this world"
            >
              Set Default
            </button>
          )}
          <button
            onClick={handleDeleteLayout}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            title="Delete this layout"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}
