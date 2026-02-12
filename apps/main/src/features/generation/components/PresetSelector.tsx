/**
 * InputSetSelector (formerly PresetSelector)
 *
 * Compact UI for selecting, saving, and managing generation input sets.
 * An "input set" bundles: prompt + input assets + generation params.
 * Designed to fit in the GenerationSettingsPanel.
 *
 * Note: This is different from the "Presets" module in Control Center which
 * shows dynamic parameter presets (quality/aspect combos from provider specs).
 */

import clsx from 'clsx';
import { useState, useRef, useEffect, useCallback } from 'react';

import { Icon } from '@lib/icons';

import { useGenerationPresets } from '../hooks/useGenerationPresets';
import { useGenerationScopeStores } from '../hooks/useGenerationScope';
import type { GenerationPreset } from '../stores/generationPresetStore';

export interface PresetSelectorProps {
  /** Whether controls are disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

export function PresetSelector({
  disabled = false,
  className,
}: PresetSelectorProps) {
  const { useSessionStore } = useGenerationScopeStores();
  const operationType = useSessionStore((s) => s.operationType);

  const {
    presetsForOperation,
    lastUsedPreset,
    loading: presetLoading,
    saveCurrentAsPreset,
    loadPresetAsync,
    deletePreset,
    renamePreset,
  } = useGenerationPresets();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newPresetName, setNewPresetName] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsSaving(false);
        setEditingId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when saving or editing
  useEffect(() => {
    if ((isSaving || editingId) && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSaving, editingId]);

  const handleSave = useCallback(() => {
    if (!newPresetName.trim()) return;
    saveCurrentAsPreset(newPresetName.trim());
    setNewPresetName('');
    setIsSaving(false);
  }, [newPresetName, saveCurrentAsPreset]);

  const handleLoad = useCallback(
    async (preset: GenerationPreset) => {
      setIsOpen(false);
      await loadPresetAsync(preset.id);
    },
    [loadPresetAsync]
  );

  const handleRename = useCallback(
    (presetId: string) => {
      if (!editName.trim()) return;
      renamePreset(presetId, editName.trim());
      setEditingId(null);
      setEditName('');
    },
    [editName, renamePreset]
  );

  const handleDelete = useCallback(
    (presetId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      deletePreset(presetId);
    },
    [deletePreset]
  );

  const startEditing = useCallback((preset: GenerationPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(preset.id);
    setEditName(preset.name);
  }, []);

  const hasPresets = presetsForOperation.length > 0;

  return (
    <div ref={dropdownRef} className={clsx('relative', className)}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || presetLoading}
        className={clsx(
          'flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium',
          'bg-white dark:bg-neutral-800 shadow-sm',
          'hover:bg-neutral-50 dark:hover:bg-neutral-700',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors',
          presetLoading && 'animate-pulse'
        )}
        title="Input Sets - Save and load prompt + inputs + settings"
      >
        <Icon name="archive" size={12} className={presetLoading ? 'animate-spin' : ''} />
        <span className="max-w-[60px] truncate">
          {presetLoading ? 'Loading...' : lastUsedPreset?.name ?? 'Sets'}
        </span>
        {!presetLoading && (
          <Icon name="chevronDown" size={10} className={clsx('transition-transform', isOpen && 'rotate-180')} />
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[180px] max-w-[240px] bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          {/* Save new preset */}
          <div className="p-2 border-b border-neutral-200 dark:border-neutral-700">
            {isSaving ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') {
                      setIsSaving(false);
                      setNewPresetName('');
                    }
                  }}
                  placeholder="Input set name..."
                  className="flex-1 px-2 py-1 text-[11px] rounded bg-neutral-100 dark:bg-neutral-700 border-0 outline-none"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!newPresetName.trim()}
                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-green-600 disabled:opacity-50"
                >
                  <Icon name="check" size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSaving(false);
                    setNewPresetName('');
                  }}
                  className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSaving(true)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
              >
                <Icon name="save" size={12} />
                Save current as input set
              </button>
            )}
          </div>

          {/* Preset list */}
          <div className="max-h-[200px] overflow-y-auto">
            {!hasPresets ? (
              <div className="px-3 py-4 text-[11px] text-neutral-500 text-center">
                No input sets for {operationType.replace(/_/g, ' ')}
              </div>
            ) : (
              presetsForOperation.map((preset) => (
                <div
                  key={preset.id}
                  className={clsx(
                    'group flex items-center gap-1 px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-700 cursor-pointer',
                    lastUsedPreset?.id === preset.id && 'bg-blue-50 dark:bg-blue-900/20'
                  )}
                  onClick={() => handleLoad(preset)}
                >
                  {editingId === preset.id ? (
                    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={inputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(preset.id);
                          if (e.key === 'Escape') {
                            setEditingId(null);
                            setEditName('');
                          }
                        }}
                        className="flex-1 px-1 py-0.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-700 border-0 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(preset.id)}
                        disabled={!editName.trim()}
                        className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 text-green-600 disabled:opacity-50"
                      >
                        <Icon name="check" size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditName('');
                        }}
                        className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-500"
                      >
                        <Icon name="x" size={10} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-[11px] truncate">{preset.name}</span>
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => startEditing(preset, e)}
                          className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-600 text-neutral-500"
                          title="Rename"
                        >
                          <Icon name="pencil" size={10} />
                        </button>
                        {!preset.isDefault && (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(preset.id, e)}
                            className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                            title="Delete"
                          >
                            <Icon name="trash2" size={10} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
