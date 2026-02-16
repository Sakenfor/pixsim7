import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import type { AssetFilters } from '../hooks/useAssets';
import { filtersEqual } from '../lib/filterUtils';
import { useFilterPresetStore } from '../stores/filterPresetStore';

import { PresetContextMenu, type PresetContextMenuState } from './PresetContextMenu';

interface FilterPresetBarProps {
  currentFilters: AssetFilters;
  onLoadPreset: (filters: AssetFilters) => void;
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

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<PresetContextMenuState | null>(null);

  useEffect(() => {
    if (isAdding) addInputRef.current?.focus();
  }, [isAdding]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const activePreset = presets.find((p) => p.id === activePresetId);
  const isModified = activePreset ? !filtersEqual(currentFilters, activePreset.filters) : false;

  const handleClickAll = useCallback(() => {
    setActivePreset(null);
    onLoadPreset({});
  }, [setActivePreset, onLoadPreset]);

  const handleClickPreset = useCallback(
    (id: string, filters: AssetFilters) => {
      setActivePreset(id);
      onLoadPreset(filters);
    },
    [setActivePreset, onLoadPreset],
  );

  const handleAddSubmit = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setIsAdding(false);
      setNewName('');
      return;
    }
    savePreset(trimmed, currentFilters);
    setIsAdding(false);
    setNewName('');
  }, [newName, currentFilters, savePreset]);

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renamePreset(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, renamePreset]);

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
            <input
              key={preset.id}
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') {
                  setRenamingId(null);
                  setRenameValue('');
                }
              }}
              className={inputClass}
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
        <input
          ref={addInputRef}
          type="text"
          placeholder="Preset name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={handleAddSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddSubmit();
            if (e.key === 'Escape') {
              setIsAdding(false);
              setNewName('');
            }
          }}
          className={inputClass}
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
          onRename={(id) => {
            const preset = presets.find((p) => p.id === id);
            if (preset) {
              setRenamingId(preset.id);
              setRenameValue(preset.name);
            }
          }}
          onUpdate={(id) => updatePreset(id, currentFilters)}
          onDelete={deletePreset}
        />
      )}
    </div>
  );
}
