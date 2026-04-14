import { useCallback, useState } from 'react';

import { Icon } from '@lib/icons';

import type { AssetFilters } from '../hooks/useAssets';
import { filtersEqual } from '../lib/filterUtils';
import { useFilterPresetStore } from '../stores/filterPresetStore';

import { InlineTextInput } from './InlineTextInput';
import { PresetContextMenu, type PresetContextMenuState } from './PresetContextMenu';

interface FilterPresetBarProps {
  currentFilters: AssetFilters;
  onLoadPreset: (filters: AssetFilters, page: number) => void;
}

const tabBase =
  'inline-flex items-center gap-1 h-7 px-2 text-xs rounded border transition-colors whitespace-nowrap select-none';
const tabInactive =
  'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200';
const tabActive =
  'border-accent/50 bg-accent/10 text-neutral-800 dark:text-neutral-100';
const inputClass =
  'h-7 px-2 text-xs rounded border border-accent bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-100 outline-none w-28';

export function FilterPresetBar({ currentFilters, onLoadPreset }: FilterPresetBarProps) {
  const presets = useFilterPresetStore((s) => s.presets);
  const activePresetId = useFilterPresetStore((s) => s.activePresetId);
  const savePreset = useFilterPresetStore((s) => s.savePreset);
  const updatePreset = useFilterPresetStore((s) => s.updatePreset);
  const renamePreset = useFilterPresetStore((s) => s.renamePreset);
  const deletePreset = useFilterPresetStore((s) => s.deletePreset);
  const setActivePreset = useFilterPresetStore((s) => s.setActivePreset);
  const getRememberedPage = useFilterPresetStore((s) => s.getRememberedPage);

  const [isAdding, setIsAdding] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<PresetContextMenuState | null>(null);

  const activePreset = presets.find((p) => p.id === activePresetId);
  const isModified = activePreset ? !filtersEqual(currentFilters, activePreset.filters) : false;

  const handleClickAll = useCallback(() => {
    const page = getRememberedPage(null);
    setActivePreset(null);
    onLoadPreset({}, page);
  }, [setActivePreset, onLoadPreset, getRememberedPage]);

  const handleClickPreset = useCallback(
    (id: string, filters: AssetFilters) => {
      const page = getRememberedPage(id);
      setActivePreset(id);
      onLoadPreset(filters, page);
    },
    [setActivePreset, onLoadPreset, getRememberedPage],
  );

  const handleAddSubmit = useCallback(
    (name: string) => {
      savePreset(name, currentFilters);
      setIsAdding(false);
    },
    [currentFilters, savePreset],
  );

  const handleRenameSubmit = useCallback(
    (name: string) => {
      if (renamingId) renamePreset(renamingId, name);
      setRenamingId(null);
    },
    [renamingId, renamePreset],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, presetId: string) => {
      e.preventDefault();
      setContextMenu({ presetId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
      {/* "All" tab */}
      <button
        type="button"
        onClick={handleClickAll}
        className={`${tabBase} ${activePresetId === null ? tabActive : tabInactive}`}
      >
        All
      </button>

      {/* Preset tabs */}
      {presets.map((preset) => {
        const isActive = activePresetId === preset.id;
        const showDot = isActive && isModified;

        if (renamingId === preset.id) {
          return (
            <InlineTextInput
              key={preset.id}
              initialValue={preset.name}
              className={inputClass}
              onSubmit={handleRenameSubmit}
              onCancel={() => setRenamingId(null)}
            />
          );
        }

        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleClickPreset(preset.id, preset.filters)}
            onContextMenu={(e) => handleContextMenu(e, preset.id)}
            className={`${tabBase} ${isActive ? tabActive : tabInactive}`}
          >
            {preset.name}
            {showDot && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
            )}
          </button>
        );
      })}

      {/* Add button / inline input */}
      {isAdding ? (
        <InlineTextInput
          placeholder="Preset name..."
          className={inputClass}
          onSubmit={handleAddSubmit}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          title="Save current filters as preset"
          className={`${tabBase} ${tabInactive}`}
        >
          <Icon name="plus" size={12} className="w-3 h-3" />
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <PresetContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onRename={(id) => setRenamingId(id)}
          onUpdate={(id) => updatePreset(id, currentFilters)}
          onDelete={deletePreset}
        />
      )}
    </div>
  );
}
